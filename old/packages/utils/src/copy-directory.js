"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyDirectory = copyDirectory;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
async function copyFile(source, destination) {
    try {
        await fs_1.promises.copyFile(source, destination);
    }
    catch (error) {
        console.error(`Error copying file: ${error}`);
    }
}
async function copyDirectory(sourceDir, destinationDir) {
    try {
        // Ensure the destination directory exists
        await fs_1.promises.mkdir(destinationDir, { recursive: true });
        // Get the list of files in the source directory
        const files = await fs_1.promises.readdir(sourceDir);
        // Create an array of promises to copy each file
        const copyFilePromises = files.map(file => {
            const sourceFile = path_1.default.join(sourceDir, file);
            const destinationFile = path_1.default.join(destinationDir, file);
            return fs_1.promises.stat(sourceFile).then(stat => {
                if (stat.isDirectory()) {
                    // If it is a directory, copy it recursively
                    return copyDirectory(sourceFile, destinationFile);
                }
                else {
                    // If it is a file, copy it directly
                    return copyFile(sourceFile, destinationFile);
                }
            });
        });
        // Wait for all copy operations to complete
        await Promise.all(copyFilePromises);
    }
    catch (error) {
        console.error(`Error copying directory: ${error}`);
    }
}
