"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installMissingDependencies = exports.installDependency = exports.determinePackageManager = exports.pnpmInstallDependency = exports.yarnInstallDependency = exports.npmInstallDependency = exports.npmInstall = void 0;
const child_process_1 = require("child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const find_package_json_1 = __importDefault(require("find-package-json"));
const npmInstall = (cwd) => {
    return new Promise((resolve, reject) => {
        (0, child_process_1.exec)(`npm install`, {
            cwd,
        }, (err, res) => {
            if (err != null) {
                return reject(err);
            }
            resolve(null);
        });
    });
};
exports.npmInstall = npmInstall;
const npmInstallDependency = (dependency, options) => {
    return new Promise((resolve, reject) => {
        const prefix = options.cwd ? `--prefix ${options.cwd}` : '';
        const development = options.development ? '-D' : '';
        (0, child_process_1.exec)(`npm install ${development} ${dependency} ${prefix}`, {
            cwd: options.cwd,
        }, (err, res) => {
            if (err != null) {
                return reject(err);
            }
            resolve(null);
        });
    });
};
exports.npmInstallDependency = npmInstallDependency;
const yarnInstallDependency = (dependency, options) => {
    return new Promise((resolve, reject) => {
        const development = options.development ? '-D' : '';
        (0, child_process_1.exec)(`yarn install ${development} ${dependency}`, {
            cwd: options.cwd,
        }, (err) => {
            if (err != null)
                return reject(err);
            resolve(null);
        });
    });
};
exports.yarnInstallDependency = yarnInstallDependency;
const pnpmInstallDependency = (dependency, options) => {
    return new Promise((resolve, reject) => {
        const development = options.development ? '-D' : '';
        (0, child_process_1.exec)(`pnpm install ${development} ${dependency}`, {
            cwd: options.cwd,
        }, (err) => {
            if (err != null)
                return reject(err);
            resolve(null);
        });
    });
};
exports.pnpmInstallDependency = pnpmInstallDependency;
const determinePackageManager = () => {
    if (node_fs_1.default.existsSync(node_path_1.default.resolve('./pnpm-lock.yaml')))
        return 'pnpm';
    if (node_fs_1.default.existsSync(node_path_1.default.resolve('./yarn-lock.json')))
        return 'yarn';
    return 'npm';
};
exports.determinePackageManager = determinePackageManager;
const installDependency = (dependency, options = {}) => {
    const packageManager = (0, exports.determinePackageManager)();
    switch (packageManager) {
        case 'npm':
            return (0, exports.npmInstallDependency)(dependency, options);
        case 'yarn':
            return (0, exports.yarnInstallDependency)(dependency, options);
        case 'pnpm':
            return (0, exports.pnpmInstallDependency)(dependency, options);
    }
};
exports.installDependency = installDependency;
const installMissingDependencies = async (dependencies, options = {}) => {
    const packageJson = (0, find_package_json_1.default)().next().value;
    const missingDependencies = dependencies.filter((d) => options.development ? packageJson?.devDependencies?.[d] == null : packageJson?.dependencies?.[d] == null);
    if (missingDependencies.length > 0) {
        console.log('Installing missing dependencies', missingDependencies.join(' '));
        await (0, exports.installDependency)(missingDependencies.join(" "), options);
    }
};
exports.installMissingDependencies = installMissingDependencies;
