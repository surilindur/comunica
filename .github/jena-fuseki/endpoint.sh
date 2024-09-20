#!/bin/bash

image=secoresearch/fuseki:latest
name=jenafuseki

if [ "$1" = "start" ]; then
    echo "Starting Jena container with name $name using $image"
    docker pull "$image"
    docker container create \
        --name "$name" \
        --network host \
        --volume "$GITHUB_WORKSPACE/.github/jena-fuseki/assembler.ttl":/fuseki-base/configuration/assembler.ttl:ro \
        --volume "$GITHUB_WORKSPACE/.github/jena-fuseki/config.ttl":/fuseki-base/config.ttl:ro \
        "$image"
    docker start "$name"
elif [ "$1" = "stop" ]; then
    echo "Stopping Jena container with name $name"
    docker stop "$name"
    docker container remove "$name"
else
    echo "Invalid action $1"
    exit 1
fi
