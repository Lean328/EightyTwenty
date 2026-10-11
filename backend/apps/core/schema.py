def add_error_responses(result, generator, request, public):
    result["paths"]["/health"] = {
        "get": {
            "operationId": "health",
            "tags": ["operations"],
            "security": [],
            "responses": {
                "200": {
                    "description": "Liveness only; does not query the database.",
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "required": ["ok"],
                                "properties": {"ok": {"type": "boolean"}},
                            }
                        }
                    },
                }
            },
        }
    }
    error = {
        "type": "object",
        "required": ["error"],
        "properties": {
            "error": {
                "type": "object",
                "required": ["code", "message", "fields"],
                "properties": {
                    "code": {"type": "string"},
                    "message": {"type": "string"},
                    "fields": {
                        "oneOf": [
                            {"type": "object", "additionalProperties": {}},
                            {"type": "array", "items": {}},
                        ]
                    },
                },
            }
        },
    }
    result.setdefault("components", {}).setdefault("schemas", {})["APIError"] = error
    for path, operations in result["paths"].items():
        if not path.startswith("/api/v1/"):
            continue
        for method, operation in operations.items():
            if method not in {"get", "post", "patch", "delete"}:
                continue
            segments = path.strip("/").split("/")
            operation["tags"] = ["/".join(segments[2:4]) if segments[2] == "bos" else segments[2]]
            for code in ["400", "401", "403", "404", "409", "429", "503"]:
                operation["responses"].setdefault(
                    code,
                    {
                        "description": "Standard API error envelope",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/APIError"}
                            }
                        },
                    },
                )
    return result
