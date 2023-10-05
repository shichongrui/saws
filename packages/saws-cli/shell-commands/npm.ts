import { exec } from "child_process"

export const npmInstall = (dependency?: string, cwd?: string) => {
  return new Promise((resolve, reject) => {
    exec(`npm install --prefix ${cwd} ${dependency}`, {
      cwd,
    }, (err, res) => {
      if (err != null) {
        return reject(err);
      }

      resolve(null);
    })
  })
}