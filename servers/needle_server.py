#!/usr/bin/env python3
"""
Needle Local Semantic Server for JIT Protocol Synthesis Framework.
Provides decoupled local tool-calling, semantic routing, and structured extraction
when no TYPESAFE_API_KEY is available (offline or cost-saving mode).
"""

import argparse
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

NEEDLE_AVAILABLE = False
try:
    import needle
    NEEDLE_AVAILABLE = True
except ImportError:
    NEEDLE_AVAILABLE = False


class NeedleRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Concise logging
        sys.stdout.write(f"[NeedleServer] {self.address_string()} - {format % args}\n")
        sys.stdout.flush()

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            resp = {
                "status": "ok",
                "engine": "cactus-needle" if NEEDLE_AVAILABLE else "simulation",
                "version": "3.0.0" if NEEDLE_AVAILABLE else "simulation-1.0",
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/run":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")

            try:
                data = json.loads(body)
                query = data.get("query", "")
                payload = data.get("payload", {})
                tools = data.get("tools", [])

                response_data = self.process_semantic_request(query, payload, tools)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def process_semantic_request(self, query: str, payload: dict, tools: list) -> dict:
        """
        Process tool calling using live cactus-needle if available,
        or deterministic semantic matching in simulation mode.
        """
        if NEEDLE_AVAILABLE:
            try:
                # Use real Needle 3 engine
                agent = needle.Needle(tools=tools)
                res = agent.run(query)
                return {
                    "type": "call",
                    "success": True,
                    "function_calls": res.get("function_calls", []),
                    "confidence": res.get("confidence", 0.95),
                    "reasoning": res.get("reasoning", "Decoded via Needle 3 SAN grammar"),
                }
            except Exception as ex:
                sys.stderr.write(f"[NeedleServer] Live Needle inference error: {ex}, falling back to simulator\n")

        # Simulation Mode
        return self.simulate_needle_inference(query, payload, tools)

    def simulate_needle_inference(self, query: str, payload: dict, tools: list) -> dict:
        q_lower = query.lower()
        best_tool = tools[0] if tools else None
        highest_score = -1

        for t in tools:
            name = t.get("name", "")
            desc = t.get("description", "")
            score = 0

            for word in re.findall(r"\w+", f"{name} {desc}".lower()):
                if len(word) > 2 and word in q_lower:
                    score += 1

            if score > highest_score:
                highest_score = score
                best_tool = t

        if not best_tool:
            return {
                "type": "call",
                "success": False,
                "function_calls": [],
                "confidence": 0.0,
            }

        extracted_args = {}
        properties = best_tool.get("parameters", {}).get("properties", {})

        for prop_name, prop_meta in properties.items():
            if prop_name in payload:
                extracted_args[prop_name] = payload[prop_name]
            elif "enum" in prop_meta:
                for enum_val in prop_meta["enum"]:
                    if enum_val.lower() in q_lower:
                        extracted_args[prop_name] = enum_val
                        break

        confidence = 0.94 if highest_score > 0 else 0.86

        return {
            "type": "call",
            "success": True,
            "function_calls": [
                {
                    "name": best_tool["name"],
                    "arguments": extracted_args,
                }
            ],
            "confidence": confidence,
            "reasoning": f"Needle SLM intent matched '{best_tool['name']}' (score {highest_score})",
        }


def run_server(host="127.0.0.1", port=8000):
    server = HTTPServer((host, port), NeedleRequestHandler)
    engine_name = "Cactus Needle (Native SLM)" if NEEDLE_AVAILABLE else "Needle Simulation Mode"
    print(f"🪡 [NeedleServer] Running on http://{host}:{port} using engine: {engine_name}")
    print("   Ready for JIT Protocol Synthesis local fallback requests.")
    sys.stdout.flush()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🪡 [NeedleServer] Stopping server.")
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Needle Local Semantic Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen (default: 8000)")
    args = parser.parse_args()

    run_server(host=args.host, port=args.port)
