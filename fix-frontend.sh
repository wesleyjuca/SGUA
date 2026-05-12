#!/bin/bash

# Script to fix the frontend architecture by replacing incomplete public/index.html

# Define source and destination files
SOURCE_FILE="index.html"
DESTINATION_FILE="public/index.html"

# Check if the source file exists
if [ -f "$SOURCE_FILE" ]; then
    # Copy the source file to the destination
    cp "$SOURCE_FILE" "$DESTINATION_FILE"
    echo "Successfully replaced $DESTINATION_FILE with $SOURCE_FILE"
else
    echo "Source file $SOURCE_FILE does not exist!"
fi
