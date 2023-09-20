import { promises as fs } from 'fs'
import path from 'path'

async function copyFile(source: string, destination: string) {
  try {
    await fs.copyFile(source, destination);
  } catch (error) {
    console.error(`Error copying file: ${error}`);
  }
}


export async function copyDirectory(sourceDir: string, destinationDir: string) {
  try {
    // Ensure the destination directory exists
    await fs.mkdir(destinationDir, { recursive: true });

    // Get the list of files in the source directory
    const files = await fs.readdir(sourceDir);

    // Create an array of promises to copy each file
    const copyFilePromises = files.map(file => {
      const sourceFile = path.join(sourceDir, file);
      const destinationFile = path.join(destinationDir, file);

      return fs.stat(sourceFile).then(stat => {
        if (stat.isDirectory()) {
          // If it is a directory, copy it recursively
          return copyDirectory(sourceFile, destinationFile);
        } else {
          // If it is a file, copy it directly
          return copyFile(sourceFile, destinationFile);
        }
      });
    });

    // Wait for all copy operations to complete
    await Promise.all(copyFilePromises);
  } catch (error) {
    console.error(`Error copying directory: ${error}`);
  }
}
