"""Copy Android's English and Spanish UI strings into the web app."""

import json
import re
from pathlib import Path
from xml.etree import ElementTree

root = Path(__file__).resolve().parents[2]
android = root / "gtav-riding-companion-android" / "app" / "src" / "main" / "res"
output = Path(__file__).resolve().parents[1] / "dist" / "i18n"
output.mkdir(parents=True, exist_ok=True)

pwa_overrides = {
    "en": {
        "connect_intro": "Start the Android bridge on your PC (node bridge/start-v1.mjs), then press Enter in its window for a six-digit pairing code.",
        "connect_scan_hint": "Scan the QR shown by the bridge on this PC, or enter the six-digit pairing code below.",
        "pwa_pin_hint": "Six digits. Press Enter in the bridge window on the PC to show a new code.",
        "pwa_bridge_key_unavailable": "Start the PC bridge and reload this page to connect.",
        "pwa_qr_port_mismatch": "The QR belongs to a different bridge port. Restart the PWA server with --bridge-port followed by the port shown in the QR.",
    },
    "es": {
        "connect_intro": "Inicia el puente Android en tu PC (node bridge/start-v1.mjs) y pulsa Enter en su ventana para ver el código de seis dígitos.",
        "connect_scan_hint": "Escanea el QR que muestra el puente en este PC, o escribe abajo el código de emparejamiento de seis dígitos.",
        "pwa_pin_hint": "Seis dígitos. Pulsa Enter en la ventana del puente en el PC para mostrar un código nuevo.",
        "pwa_bridge_key_unavailable": "Inicia el puente en el PC y recarga esta página para conectarte.",
        "pwa_qr_port_mismatch": "El QR pertenece a otro puerto del puente. Reinicia el servidor PWA con --bridge-port y el puerto que muestra el QR.",
    },
}

for locale, directory in (("en", "values"), ("es", "values-es")):
    strings = {}
    for filename in ("strings.xml", "strings_game_options.xml", "strings_help.xml"):
        document = ElementTree.parse(android / directory / filename)
        for node in document.getroot():
            name = node.get("name")
            if not name:
                continue
            if node.tag == "string":
                strings[name] = "".join(node.itertext()).replace("\\'", "'").replace("\\n", "\n")
            elif node.tag == "plurals":
                for item in node:
                    strings[f"{name}_{item.get('quantity')}"] = "".join(item.itertext()).replace("\\'", "'")
    strings.update(pwa_overrides[locale])
    (output / f"{locale}.json").write_text(json.dumps(strings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

topics_source = (root / "gtav-riding-companion-android" / "app" / "src" / "main" / "java" /
                 "com" / "fariddroid" / "gtbikecompanion" / "ui" / "help" / "HelpTopic.kt").read_text(encoding="utf-8")
topics = {
    help_id: {"title": title, "body": body}
    for help_id, title, body in re.findall(
        r'\("([\w.]+)", R\.string\.([\w]+), R\.string\.([\w]+)\)', topics_source
    )
    if not help_id.startswith("devices.")
}
(output / "help-topics.json").write_text(json.dumps(topics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
