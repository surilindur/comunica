#!/bin/bash

action="$1"
name="$2"
image=secoresearch/fuseki:latest

if [ "$action" = "start" ]; then
    echo "Starting Jena container with name $name using $image"
    docker pull "$image"
    docker container create \
        --name "$name" \
        --network host \
        --volume "$GITHUB_WORKSPACE/.github/jena-fuseki/assembler.ttl":/fuseki-base/configuration/assembler.ttl:ro \
        --volume "$GITHUB_WORKSPACE/.github/jena-fuseki/config.ttl":/fuseki-base/config.ttl:ro \
        "$image"
    docker start "$name"
elif [ "$action" = "stop" ]; then
    echo "Stopping Jena container with name $name"
    docker stop "$name"
    docker container remove "$name"
else
    echo "Invalid action $action"
    exit 1
fi
