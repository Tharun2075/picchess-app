"""Export the trained TileNet to ONNX (opset 17, dynamic batch, softmax baked in), optional int8 dynamic quantisation.

  .venv/bin/python ml/export_onnx.py --pt data/model/tilenet.pt --out data/model/tilenet.onnx
"""
import argparse
from pathlib import Path
import torch
from train_squares import TileNet, ExportNet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pt", default="data/model/tilenet.pt")
    ap.add_argument("--out", default="data/model/tilenet.onnx")
    ap.add_argument("--int8", action="store_true", help="also write <out>.int8.onnx via onnxruntime dynamic quantisation")
    a = ap.parse_args()
    m = TileNet(); m.load_state_dict(torch.load(a.pt, map_location="cpu")); m.eval()
    torch.onnx.export(ExportNet(m), torch.zeros(64, 1024), a.out, input_names=["tiles"], output_names=["probs"],
                      dynamic_axes={"tiles": {0: "n"}, "probs": {0: "n"}}, opset_version=17, external_data=False, dynamo=False)
    print("wrote", a.out, Path(a.out).stat().st_size, "bytes")
    if a.int8:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        q = a.out.replace(".onnx", ".int8.onnx")
        quantize_dynamic(a.out, q, weight_type=QuantType.QInt8)
        print("wrote", q, Path(q).stat().st_size, "bytes")


if __name__ == "__main__":
    main()
