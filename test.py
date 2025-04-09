from time import sleep
from json import dumps
from pathlib import Path
from traceback import format_exc
from subprocess import run
from subprocess import PIPE

from rdflib.term import Literal
from rdflib.graph import Graph
from rdflib.namespace import SDO
from rdflib.namespace import SH
from rdflib.namespace import Namespace

SLEEP_TIME = 10

SPEX = Namespace("https://purl.expasy.org/sparql-examples/ontology#")

ENGINE_BIN = Path(__file__).parent.joinpath(
    "engines",
    "query-sparql",
    "bin",
    "query-dynamic.js",
)

CONFIG_VOID = Path(__file__).parent.joinpath(
    "engines",
    "config-query-sparql",
    "config",
    "config-default-v4-1-0.json",
)

CONFIG_BASE = CONFIG_VOID.parent.joinpath("config-default.json")

TEST_CONFIGS = {"void": CONFIG_VOID, "base": CONFIG_BASE}


def execute_query(path: Path) -> None:
    graph = Graph()
    graph.parse(path)
    query: Literal = tuple(graph.objects(predicate=SH.select, unique=True))[0]
    query_string = query.replace("'", '"')
    sources = [
        *graph.objects(predicate=SDO.target, unique=True),
        *graph.objects(predicate=SPEX.federatesWith, unique=True),
    ]
    query_context = dumps({"sources": sources})
    for case, config in TEST_CONFIGS.items():
        for i in range(0, 1):
            try:
                identifier = path.name.removesuffix(".ttl")
                print(f"Executing {identifier} with {config.name}")
                output = run(
                    args=(
                        "node",
                        ENGINE_BIN.as_posix(),
                        "--query",
                        query_string,
                        "--context",
                        query_context,
                        "-t",
                        "stats",
                    ),
                    stdout=PIPE,
                    stderr=PIPE,
                    encoding="utf-8",
                    env={"COMUNICA_CONFIG": config.as_posix()},
                )
                if output.returncode == 0:
                    output = output.stdout
                else:
                    output = output.stderr
            except Exception as ex:
                output = format_exc()
                print(ex)
            with open(
                path.parent.joinpath(f"{identifier}-{case}-{i}.tsv"), "w"
            ) as output_file:
                output_file.write(output)
            print(f"Sleeping for {SLEEP_TIME} seconds")
            sleep(SLEEP_TIME)


def execute_from_path(path: Path) -> None:
    print(f"Executing from {path}")
    for fp in path.iterdir():
        if fp.name.endswith(".ttl"):
            execute_query(fp)


if __name__ == "__main__":
    path = Path(__file__).parent.joinpath("test-queries")
    execute_from_path(path)
