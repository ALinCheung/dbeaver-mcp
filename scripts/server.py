#!/usr/bin/env python3
"""
server.py — MCP server do dbeaver-mcp.
Expõe tools para gerenciar conexões DBeaver e executar queries MySQL.
Rode via: python server.py
"""

import json
import sys
import traceback
from pathlib import Path
from typing import Any

# Adiciona o diretório raiz do repo ao path para encontrar dbeaver.py
sys.path.insert(0, str(Path(__file__).parent.parent))
import dbeaver

# ── Conexão MySQL ────────────────────────────────────────────────────────────

def _mysql_connect(conn_info: dict):
    try:
        import mysql.connector
    except ImportError:
        raise RuntimeError("mysql-connector-python não instalado. Execute: pip install mysql-connector-python")
    return mysql.connector.connect(
        host=conn_info["host"],
        port=conn_info["port"],
        database=conn_info["database"] or None,
        user=conn_info["user"],
        password=conn_info["password"],
        connection_timeout=10,
    )


def _run_query(conn_info: dict, sql: str, params=None):
    conn = _mysql_connect(conn_info)
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params or [])
        rows = cur.fetchall()
        columns = [d[0] for d in cur.description] if cur.description else []
        return {"columns": columns, "rows": rows, "rowcount": cur.rowcount}
    finally:
        conn.close()


def _run_write(conn_info: dict, sql: str):
    conn = _mysql_connect(conn_info)
    try:
        cur = conn.cursor()
        cur.execute(sql)
        conn.commit()
        return {"rowcount": cur.rowcount, "lastrowid": cur.lastrowid}
    finally:
        conn.close()


# ── Tool handlers ────────────────────────────────────────────────────────────

def handle_list_connections(_args: dict) -> dict:
    connections = dbeaver.list_connections_safe()
    return {"connections": connections, "total": len(connections)}


def handle_get_connection(args: dict) -> dict:
    name = args.get("name", "")
    info = dbeaver.get_connection_info(name)
    if not info:
        return {"error": f"Conexão '{name}' não encontrada."}
    # Remove senha da resposta — nunca expor
    safe = {k: v for k, v in info.items() if k != "password"}
    safe["has_password"] = bool(info.get("password"))
    return safe


def handle_add_connection(args: dict) -> dict:
    required = ["name", "host", "port", "database", "user", "password"]
    missing = [f for f in required if not args.get(f)]
    if missing:
        return {"error": f"Campos obrigatórios ausentes: {missing}"}
    conn_id = dbeaver.add_connection(
        name=args["name"],
        host=args["host"],
        port=int(args["port"]),
        database=args["database"],
        user=args["user"],
        password=args["password"],
        driver=args.get("driver", "mysql8"),
    )
    return {"success": True, "id": conn_id, "name": args["name"]}


def handle_edit_connection(args: dict) -> dict:
    name = args.get("name", "")
    if not name:
        return {"error": "Campo 'name' obrigatório."}
    ok = dbeaver.edit_connection(
        name_or_id=name,
        host=args.get("host"),
        port=int(args["port"]) if args.get("port") else None,
        database=args.get("database"),
        user=args.get("user"),
        password=args.get("password"),
    )
    if not ok:
        return {"error": f"Conexão '{name}' não encontrada."}
    return {"success": True, "updated": name}


def handle_remove_connection(args: dict) -> dict:
    name = args.get("name", "")
    if not name:
        return {"error": "Campo 'name' obrigatório."}
    ok = dbeaver.remove_connection(name)
    if not ok:
        return {"error": f"Conexão '{name}' não encontrada."}
    return {"success": True, "removed": name}


def handle_test_connection(args: dict) -> dict:
    name = args.get("name", "")
    info = dbeaver.get_connection_info(name)
    if not info:
        return {"success": False, "error": f"Conexão '{name}' não encontrada."}
    try:
        result = _run_query(info, "SELECT 1 AS ok, VERSION() AS version")
        row = result["rows"][0] if result["rows"] else {}
        return {"success": True, "version": row.get("version", ""), "name": name}
    except Exception as e:
        return {"success": False, "error": str(e)}


def handle_run_query(args: dict) -> dict:
    name = args.get("connection", "")
    sql = args.get("sql", "").strip()
    if not name or not sql:
        return {"error": "Campos 'connection' e 'sql' são obrigatórios."}
    # Bloqueia operações de escrita perigosas
    keyword = sql.upper().split()[0] if sql else ""
    if keyword in ("INSERT", "UPDATE", "DELETE", "DROP", "TRUNCATE", "ALTER", "CREATE"):
        return {"error": f"Use run_write para operações de escrita ({keyword}). run_query é somente leitura."}
    info = dbeaver.get_connection_info(name)
    if not info:
        return {"error": f"Conexão '{name}' não encontrada."}
    try:
        return _run_query(info, sql)
    except Exception as e:
        return {"error": str(e)}


def handle_run_write(args: dict) -> dict:
    name = args.get("connection", "")
    sql = args.get("sql", "").strip()
    confirmed = args.get("confirmed", False)
    if not name or not sql:
        return {"error": "Campos 'connection' e 'sql' são obrigatórios."}
    if not confirmed:
        return {
            "requires_confirmation": True,
            "message": f"Confirme a execução da operação de escrita na conexão '{name}'.",
            "sql_preview": sql[:300],
        }
    info = dbeaver.get_connection_info(name)
    if not info:
        return {"error": f"Conexão '{name}' não encontrada."}
    try:
        return _run_write(info, sql)
    except Exception as e:
        return {"error": str(e)}


def handle_list_tables(args: dict) -> dict:
    name = args.get("connection", "")
    database = args.get("database", "")
    info = dbeaver.get_connection_info(name)
    if not info:
        return {"error": f"Conexão '{name}' não encontrada."}
    db = database or info["database"]
    if not db:
        return {"error": "Informe o banco de dados ('database')."}
    try:
        result = _run_query(info, "SHOW TABLES FROM `{}`".format(db))
        tables = [list(r.values())[0] for r in result["rows"]]
        return {"database": db, "tables": tables, "total": len(tables)}
    except Exception as e:
        return {"error": str(e)}


def handle_describe_table(args: dict) -> dict:
    name = args.get("connection", "")
    table = args.get("table", "")
    database = args.get("database", "")
    if not name or not table:
        return {"error": "Campos 'connection' e 'table' são obrigatórios."}
    info = dbeaver.get_connection_info(name)
    if not info:
        return {"error": f"Conexão '{name}' não encontrada."}
    db = database or info["database"]
    try:
        columns = _run_query(info, f"DESCRIBE `{db}`.`{table}`")
        indexes = _run_query(info, f"SHOW INDEX FROM `{db}`.`{table}`")
        create = _run_query(info, f"SHOW CREATE TABLE `{db}`.`{table}`")
        create_sql = list(create["rows"][0].values())[1] if create["rows"] else ""
        return {
            "table": table,
            "database": db,
            "columns": columns["rows"],
            "indexes": indexes["rows"],
            "create_sql": create_sql,
        }
    except Exception as e:
        return {"error": str(e)}


def handle_explain_query(args: dict) -> dict:
    name = args.get("connection", "")
    sql = args.get("sql", "").strip()
    if not name or not sql:
        return {"error": "Campos 'connection' e 'sql' são obrigatórios."}
    info = dbeaver.get_connection_info(name)
    if not info:
        return {"error": f"Conexão '{name}' não encontrada."}
    try:
        basic = _run_query(info, f"EXPLAIN {sql}")
        red_flags = []
        for row in basic["rows"]:
            t = row.get("type", "")
            extra = row.get("Extra", "")
            if t == "ALL":
                red_flags.append(f"Full table scan na tabela '{row.get('table', '')}'")
            if "Using filesort" in (extra or ""):
                red_flags.append(f"Using filesort na tabela '{row.get('table', '')}'")
            if "Using temporary" in (extra or ""):
                red_flags.append(f"Using temporary na tabela '{row.get('table', '')}'")
        return {"plan": basic["rows"], "red_flags": red_flags}
    except Exception as e:
        return {"error": str(e)}


def handle_show_processlist(args: dict) -> dict:
    name = args.get("connection", "")
    info = dbeaver.get_connection_info(name)
    if not info:
        return {"error": f"Conexão '{name}' não encontrada."}
    try:
        return _run_query(info, "SHOW FULL PROCESSLIST")
    except Exception as e:
        return {"error": str(e)}


def handle_show_slow_queries(args: dict) -> dict:
    name = args.get("connection", "")
    limit = int(args.get("limit", 20))
    info = dbeaver.get_connection_info(name)
    if not info:
        return {"error": f"Conexão '{name}' não encontrada."}
    sql = f"""
        SELECT digest_text, count_star, avg_timer_wait/1e12 AS avg_sec,
               max_timer_wait/1e12 AS max_sec, sum_rows_examined
        FROM performance_schema.events_statements_summary_by_digest
        ORDER BY avg_timer_wait DESC
        LIMIT {limit}
    """
    try:
        return _run_query(info, sql)
    except Exception as e:
        return {"error": str(e)}


# ── Tool registry ────────────────────────────────────────────────────────────

TOOLS = {
    "list_connections":   (handle_list_connections,   "Lista todas as conexões DBeaver (sem senhas)"),
    "get_connection":     (handle_get_connection,     "Retorna detalhes de uma conexão pelo nome"),
    "add_connection":     (handle_add_connection,     "Adiciona nova conexão ao DBeaver"),
    "edit_connection":    (handle_edit_connection,    "Edita host/porta/banco/usuário/senha de uma conexão"),
    "remove_connection":  (handle_remove_connection,  "Remove uma conexão do DBeaver"),
    "test_connection":    (handle_test_connection,    "Testa conectividade de uma conexão"),
    "run_query":          (handle_run_query,          "Executa SELECT/SHOW/EXPLAIN (somente leitura)"),
    "run_write":          (handle_run_write,          "Executa INSERT/UPDATE/DELETE/DDL (requer confirmação)"),
    "list_tables":        (handle_list_tables,        "Lista tabelas de um banco de dados"),
    "describe_table":     (handle_describe_table,     "Descreve estrutura, índices e CREATE TABLE"),
    "explain_query":      (handle_explain_query,      "Roda EXPLAIN e aponta red flags"),
    "show_processlist":   (handle_show_processlist,   "Mostra queries em execução no servidor"),
    "show_slow_queries":  (handle_show_slow_queries,  "Lista queries lentas do performance_schema"),
}

# ── MCP stdio protocol ───────────────────────────────────────────────────────

def send(obj: dict):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def handle_request(req: dict) -> dict:
    method = req.get("method", "")
    req_id = req.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0", "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "serverInfo": {"name": "dbeaver-mcp", "version": "1.0.0"},
                "capabilities": {"tools": {}},
            },
        }

    if method == "tools/list":
        tools_list = [
            {"name": name, "description": desc, "inputSchema": {"type": "object", "properties": {}}}
            for name, (_, desc) in TOOLS.items()
        ]
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": tools_list}}

    if method == "tools/call":
        params = req.get("params", {})
        tool_name = params.get("name", "")
        args = params.get("arguments", {})
        handler, _ = TOOLS.get(tool_name, (None, None))
        if not handler:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Tool '{tool_name}' não encontrada."}}
        try:
            result = handler(args)
            return {
                "jsonrpc": "2.0", "id": req_id,
                "result": {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, default=str)}]},
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0", "id": req_id,
                "result": {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}]},
            }

    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Método '{method}' não suportado."}}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            send(handle_request(req))
        except json.JSONDecodeError:
            send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "JSON inválido."}})
        except Exception as e:
            send({"jsonrpc": "2.0", "id": None, "error": {"code": -32603, "message": str(e)}})


if __name__ == "__main__":
    main()
