"""Regenerate assets/models/robot-glb.js after editing assets/models/robot.glb."""
import base64, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / "assets" / "models"
b64 = base64.b64encode((root / "robot.glb").read_bytes()).decode()
(root / "robot-glb.js").write_text(
    "/* GENERATED from robot.glb by tools/embed_glb.py. Do not edit by hand.\n"
    "   Embedded as base64 so the app still works when index.html is opened by double-click (file://). */\n"
    f'window.PT_ROBOT_GLB_B64="{b64}";\n')
print("wrote robot-glb.js")
