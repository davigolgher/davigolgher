#!/usr/bin/env bash
# Roda a bateria inteira: servidor, criptografia e paridade do SDK.
set -e
cd "$(dirname "$0")"
[ -d .venv ] || { python3 -m venv .venv; .venv/bin/pip install -q -r requirements.txt; }

echo "=== Parte 1: verificacao de identidade ==="
.venv/bin/python tests/test_flow.py

echo
echo "=== Parte 2: humanidade anonima ==="
.venv/bin/python tests/test_personhood.py

echo
echo "=== Paridade navegador x servidor ==="
VEC=$(mktemp)
.venv/bin/python tests/make_vectors.py "$VEC"
node tests/test_sdk_math.js "$VEC"
rm -f "$VEC"

echo
echo "TUDO VERDE"
