#!/bin/bash

# Check if version type argument is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 {major|minor|patch}"
    exit 1
fi

VERSION_TYPE=$1

# Function to increment version
increment_version() {
    local version=$1
    local type=$2
    if [ "$type" == "major" ]; then
        echo "$version" | awk -F. -v OFS=. '{$1 = $1 + 1; $2 = 0; $3 = 0; print}'
    elif [ "$type" == "minor" ]; then
        echo "$version" | awk -F. -v OFS=. '{$2 = $2 + 1; $3 = 0; print}'
    elif [ "$type" == "patch" ]; then
        echo "$version" | awk -F. -v OFS=. '{$3 = $3 + 1; print}'
    else
        echo "Invalid version type: $type" >&2
        exit 2
    fi
}

# Loop through each package.json, excluding node_modules
find . -name 'package.json' -not -path '*/node_modules/*' | while read -r pkg; do
    # Extract current version
    current_version=$(jq -r '.version' "$pkg")
    # Increment version
    if [ ! -z "$current_version" ]; then # Check if version exists
        new_version=$(increment_version "$current_version" "$VERSION_TYPE")
        # Update version in package.json
        jq --arg new_version "$new_version" '.version = $new_version' "$pkg" > "temp.json" && mv "temp.json" "$pkg"
        echo "Updated $pkg to $new_version"
    fi
done
