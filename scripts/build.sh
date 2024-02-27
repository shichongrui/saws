#!/bin/bash

find ./packages -type d -name 'dist' -exec rm -r {} +
npx tsc -b