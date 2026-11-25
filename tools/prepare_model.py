"""Build the demo canopy from the user's Tent_8_8.glb. Requires NumPy and Pillow.

    python tools/prepare_model.py "/path/to/Tent_glb (1).zip"

The source is an 8-foot frame, used here as a scaled visualization proxy for
the catalog's 10-foot footprint. Heights are illustrative, not cutting specs.
"""

import argparse
import hashlib
import io
import json
import struct
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image


WIDTH = 3.048
SOURCE_FLOOR = -0.0005357991904020309
SOURCE_HEM = 1.1999231576919556
SOURCE_EAVE = 1.559
SOURCE_PEAK = 2.624439239501953
TARGET_HEIGHTS = np.array([0, 1.90, 2.26, 3.30])
SOURCE_HEIGHTS = np.array([SOURCE_FLOOR, SOURCE_HEM, SOURCE_EAVE, SOURCE_PEAK])
SIDES = ("front", "right", "back", "left")
COMPONENTS = {5120: "i1", 5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


class Source:
    def __init__(self, data):
        if data[:4] != b"glTF":
            raise ValueError("Expected a binary glTF file.")
        length = struct.unpack_from("<I", data, 12)[0]
        self.doc = json.loads(data[20:20 + length])
        self.bin = data[28 + length:]

    def array(self, i):
        a = self.doc["accessors"][i]
        v = self.doc["bufferViews"][a["bufferView"]]
        width = WIDTHS[a["type"]]
        dt = np.dtype(COMPONENTS[a["componentType"]])
        return np.ndarray(
            (a["count"], width), dtype=dt, buffer=self.bin,
            offset=v.get("byteOffset", 0) + a.get("byteOffset", 0),
            strides=(v.get("byteStride", dt.itemsize * width), dt.itemsize),
        )

    def geometry(self, primitive):
        a = primitive["attributes"]
        return (
            self.array(a["POSITION"]).astype("f8"),
            self.array(a["NORMAL"]).astype("f8"),
            self.array(primitive["indices"]).reshape(-1, 3).astype("i4"),
        )

    def image(self, name):
        img = next(i for i in self.doc["images"] if i["name"] == name)
        v = self.doc["bufferViews"][img["bufferView"]]
        start = v.get("byteOffset", 0)
        return Image.open(io.BytesIO(self.bin[start:start + v["byteLength"]]))


class Model:
    """Write ordinary indexed glTF buffers with normalized byte normals."""

    def __init__(self, digest):
        self.data = bytearray()
        self.doc = {
            "asset": {
                "version": "2.0",
                "generator": "Fieldwork Studio / prepare_model.py",
                "extras": {
                    "source": "Tent_8_8.glb", "sourceSha256": digest,
                    "units": "meters", "nominalFootprint": [WIDTH, WIDTH],
                    "hemHeight": 1.90, "eaveHeight": 2.26, "peakHeight": 3.30,
                },
            },
            "extensionsUsed": ["KHR_mesh_quantization"],
            "extensionsRequired": ["KHR_mesh_quantization"],
            "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "meshes": [],
            "materials": [], "bufferViews": [], "accessors": [], "buffers": [],
        }

    def accessor(self, values, ctype, kind, *, normalized=False, indices=False, bounds=False):
        self.data.extend(bytes((-len(self.data)) % 4))
        raw = np.ascontiguousarray(values, dtype=COMPONENTS[ctype])
        if raw.ndim == 1:
            raw = raw[:, None]
        v = {"buffer": 0, "byteOffset": len(self.data), "target": 34963 if indices else 34962}
        # glTF requires four-byte alignment for each vertex attribute element.
        if not indices and raw.shape[1] * raw.itemsize % 4:
            padding = (-raw.shape[1] * raw.itemsize) % 4
            raw = np.pad(raw, ((0, 0), (0, padding // raw.itemsize)))
            v["byteStride"] = raw.shape[1] * raw.itemsize
        encoded = raw.tobytes()
        v["byteLength"] = len(encoded)
        self.data.extend(encoded)
        view_id = len(self.doc["bufferViews"])
        self.doc["bufferViews"].append(v)
        acc = {"bufferView": view_id, "componentType": ctype, "count": len(raw), "type": kind}
        if normalized:
            acc["normalized"] = True
        if bounds:
            acc["min"] = values.min(axis=0).astype(float).tolist()
            acc["max"] = values.max(axis=0).astype(float).tolist()
        self.doc["accessors"].append(acc)
        return len(self.doc["accessors"]) - 1

    def mesh(self, name, positions, normals, faces, material, uv=None, colors=None):
        used, new_indices = np.unique(faces.ravel(), return_inverse=True)
        pos = positions[used].astype("<f4")
        norm = normals[used]
        norm = norm / np.maximum(np.linalg.norm(norm, axis=1, keepdims=True), 1e-10)
        attrs = {
            "POSITION": self.accessor(pos, 5126, "VEC3", bounds=True),
            "NORMAL": self.accessor(np.rint(norm * 127), 5120, "VEC3", normalized=True),
        }
        if uv is not None:
            attrs["TEXCOORD_0"] = self.accessor(
                np.rint(np.clip(uv[used], 0, 1) * 65535), 5123, "VEC2", normalized=True,
            )
        if colors is not None:
            attrs["COLOR_0"] = self.accessor(colors[used], 5121, "VEC3", normalized=True)
        idx = self.accessor(new_indices, 5123 if len(pos) < 65536 else 5125, "SCALAR", indices=True)
        mat_id = len(self.doc["materials"])
        self.doc["materials"].append(material)
        mesh_id = len(self.doc["meshes"])
        self.doc["meshes"].append({
            "name": name, "primitives": [{"attributes": attrs, "indices": idx, "material": mat_id}],
        })
        self.doc["scenes"][0]["nodes"].append(len(self.doc["nodes"]))
        self.doc["nodes"].append({"mesh": mesh_id, "name": name})
        print(f"{name:<16} {len(pos):>6,} vertices / {len(faces):>6,} triangles")

    def write(self, path):
        self.data.extend(bytes((-len(self.data)) % 4))
        self.doc["buffers"] = [{"byteLength": len(self.data)}]
        header = json.dumps(self.doc, separators=(",", ":")).encode()
        header += b" " * (-len(header) % 4)
        length = 28 + len(header) + len(self.data)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as f:
            f.write(struct.pack("<4sII", b"glTF", 2, length))
            f.write(struct.pack("<I4s", len(header), b"JSON"))
            f.write(header)
            f.write(struct.pack("<I4s", len(self.data), b"BIN\0"))
            f.write(self.data)
        print(f"Wrote {path} ({length:,} bytes)")


def rescale(positions, normals, center, horizontal_scale):
    pos = positions.copy()
    pos[:, [0, 2]] = (pos[:, [0, 2]] - center) * horizontal_scale
    y = positions[:, 1]
    pos[:, 1] = np.interp(y, SOURCE_HEIGHTS, TARGET_HEIGHTS)
    levels = np.clip(np.searchsorted(SOURCE_HEIGHTS[1:], y), 0, 2)
    slopes = np.diff(TARGET_HEIGHTS) / np.diff(SOURCE_HEIGHTS)
    norm = normals.copy()
    norm[:, [0, 2]] /= horizontal_scale
    norm[:, 1] /= slopes[levels]
    norm /= np.maximum(np.linalg.norm(norm, axis=1, keepdims=True), 1e-10)
    return pos, norm


def fabric_material(name, color):
    return {
        "name": name, "doubleSided": True,
        "pbrMetallicRoughness": {"baseColorFactor": [*color, 1], "roughnessFactor": 0.93, "metallicFactor": 0},
    }


def make_fabric(model, positions, normals, faces):
    centers = positions[faces].mean(axis=1)
    sides = np.argmax(np.stack([
        centers[:, 2], centers[:, 0], -centers[:, 2], -centers[:, 0],
    ], axis=1), axis=1)
    roof = centers[:, 1] >= TARGET_HEIGHTS[2]

    for index, side in enumerate(SIDES):
        east = (positions[:, 0], -positions[:, 2], -positions[:, 0], positions[:, 2])[index]
        outward = (positions[:, 2], positions[:, 0], -positions[:, 2], -positions[:, 0])[index]
        u = 0.5 + east / WIDTH
        for is_roof, group in ((True, "roof"), (False, "valance")):
            name = group + "-" + side
            # In artwork space v points down. Use radial depth on the roof to
            # flatten its slight concavity to the editor's straight-edged triangle.
            v = (outward / (WIDTH * 0.5) if is_roof else
                 (TARGET_HEIGHTS[2] - positions[:, 1]) / (TARGET_HEIGHTS[2] - TARGET_HEIGHTS[1]))
            uv = np.column_stack([u, v])
            model.mesh(name, positions, normals, faces[(sides == index) & (roof == is_roof)],
                       fabric_material(name, [1, 1, 1]), uv=uv)


def web_frame(model, source, primitive, mesh_name, atlas, center, horizontal_scale):
    positions, normals, faces = source.geometry(primitive)
    pos, norm = rescale(positions, normals, center, horizontal_scale)
    uv = source.array(primitive["attributes"]["TEXCOORD_0"])
    height, width = atlas.shape[:2]
    texel = np.floor((uv[faces].mean(axis=1) % 1) * [width, height]).astype("i4")
    color = atlas[texel[:, 1], texel[:, 0], :3].astype("i4")
    # Preserve alloy channels, black couplers and warm release catches from the
    # source atlas without downloading its three 2048px maps at runtime.
    clas = np.where(color[:, 0] - color[:, 1] > 50, 2, np.where(color.mean(axis=1) < 100, 0, 1))
    srgb = np.array([[58, 61, 63], [192, 198, 201], [180, 72, 45]]) / 255
    linear = np.where(srgb <= .04045, srgb / 12.92, ((srgb + .055) / 1.055) ** 2.4)
    palette = np.rint(linear * 255).astype("u1")

    # Cluster sub-centimeter hardware detail. Preserve hard edges and the
    # aluminum/polymer boundaries; discard collapsed and duplicate triangles.
    corners = faces.ravel()
    grid = .007
    cells = np.rint(pos[corners] / grid).astype("i4")
    normal_cells = np.rint(norm[corners] * 2).astype("i4")
    keys = np.column_stack([cells, normal_cells, np.repeat(clas, 3)])
    unique, inverse, counts = np.unique(keys, axis=0, return_inverse=True, return_counts=True)
    quant_pos = np.stack([np.bincount(inverse, weights=pos[corners, i]) / counts for i in range(3)], axis=1)
    quant_norm = np.stack([np.bincount(inverse, weights=norm[corners, i]) / counts for i in range(3)], axis=1)
    triangles = inverse.reshape(-1, 3)
    a, b, c = (quant_pos[triangles[:, i]] for i in range(3))
    areas = np.linalg.norm(np.cross(b - a, c - a), axis=1)
    triangles = triangles[areas > .000002]
    _, distinct = np.unique(np.sort(triangles, axis=1), axis=0, return_index=True)
    triangles = triangles[np.sort(distinct)]
    mat = {"name": mesh_name, "doubleSided": True, "pbrMetallicRoughness": {"metallicFactor": .24, "roughnessFactor": .48}}
    model.mesh(mesh_name, quant_pos, quant_norm, triangles, mat, colors=palette[unique[:, -1]])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public/models/canopy-10.glb")
    args = parser.parse_args()
    if zipfile.is_zipfile(args.source):
        with zipfile.ZipFile(args.source) as bundle:
            data = bundle.read(next(n for n in bundle.namelist() if n.endswith("Tent_8_8.glb")))
    else:
        data = args.source.read_bytes()
    source = Source(data)
    model = Model(hashlib.sha256(data).hexdigest())
    by_name = {node["name"]: source.doc["meshes"][node["mesh"]]
               for node in source.doc["nodes"] if "mesh" in node}
    cloth = {source.doc["materials"][p["material"]]["name"]: p for p in by_name["fabric"]["primitives"]}
    pos, norm, faces = source.geometry(cloth["fabric_Mat"])
    xmin, xmax = pos[:, [0, 2]].min(axis=0), pos[:, [0, 2]].max(axis=0)
    center, scale = (xmin + xmax) / 2, WIDTH / (xmax - xmin)
    pos, norm = rescale(pos, norm, center, scale)
    make_fabric(model, pos, norm, faces)
    pos, norm, faces = source.geometry(cloth["Inner_fabric"])
    pos, norm = rescale(pos, norm, center, scale)
    model.mesh("lining", pos, norm, faces, fabric_material("lining", [.32, .35, .29]))
    atlas = np.asarray(source.image("Metal_mat_BaseColor").convert("RGB"))
    for source_name, target in [("leg", "frame-legs"), ("mechanism", "frame-braces")]:
        web_frame(model, source, by_name[source_name]["primitives"][0], target, atlas, center, scale)
    model.write(args.output)


if __name__ == "__main__":
    main()
