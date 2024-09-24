#!/bin/bash

image=ldf-server:dev
name=ldf-server

if [ "$1" = "start" ]; then
    echo "Starting LDF server container with name $name and tag $image"
    docker build --network host --tag "$image" .
    docker container create \
        --name "$name" \
        --network host \
        --volume "$GITHUB_WORKSPACE"/.github/ldf-docker/config.json:/opt/ldf-server/config.json:ro \
        --volume "$GITHUB_WORKSPACE"/.github/test-data/example.nq:/opt/ldf-server/data.nq:ro \
        "$image"
    docker start "$name"
elif [ "$1" = "stop" ]; then
    echo "Stopping LDF server container with name $name"
    docker stop "$name"
    docker container remove "$name"
    docker image remove "$image"
else
    echo "Invalid action $1"
    exit 1
fi
