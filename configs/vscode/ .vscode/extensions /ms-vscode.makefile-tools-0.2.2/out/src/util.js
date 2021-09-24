"use strict";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.thisExtensionPath = exports.thisExtensionPackage = exports.thisExtension = exports.scheduleAsyncTask = exports.scheduleTask = exports.resolvePathToRoot = exports.reportDryRunError = exports.sortAndRemoveDuplicates = exports.removeDuplicates = exports.mergeProperties = exports.hasProperties = exports.areEqual = exports.elapsedTimeSince = exports.escapeString = exports.removeSurroundingQuotes = exports.removeQuotes = exports.makeRelPaths = exports.makeRelPath = exports.makeFullPaths = exports.makeFullPath = exports.cygpath = exports.dropNulls = exports.spawnChildProcess = exports.mergeEnvironment = exports.normalizeEnvironmentVarname = exports.killTree = exports.toolPathInEnv = exports.pathIsCurrentDirectory = exports.looksLikePath = exports.getWorkspaceRoot = exports.parseCompilerArgsScriptFile = exports.tmpDir = exports.writeFile = exports.readFile = exports.deleteFileSync = exports.checkDirectoryExistsSync = exports.checkFileExistsSync = void 0;
// Helper APIs used by this extension
const fs = require("fs");
const child_process = require("child_process");
const logger = require("./logger");
const make = require("./make");
const path = require("path");
const vscode = require("vscode");
function checkFileExistsSync(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    }
    catch (e) {
    }
    return false;
}
exports.checkFileExistsSync = checkFileExistsSync;
function checkDirectoryExistsSync(directoryPath) {
    try {
        return fs.statSync(directoryPath).isDirectory();
    }
    catch (e) {
    }
    return false;
}
exports.checkDirectoryExistsSync = checkDirectoryExistsSync;
function deleteFileSync(filePath) {
    try {
        fs.unlinkSync(filePath);
    }
    catch (e) {
    }
}
exports.deleteFileSync = deleteFileSync;
function readFile(filePath) {
    try {
        if (checkFileExistsSync(filePath)) {
            return fs.readFileSync(filePath).toString();
        }
    }
    catch (e) {
    }
    return undefined;
}
exports.readFile = readFile;
function writeFile(filePath, content) {
    try {
        fs.writeFileSync(filePath, content);
    }
    catch (e) {
    }
    return undefined;
}
exports.writeFile = writeFile;
// Get the platform-specific temporary directory
function tmpDir() {
    if (process.platform === 'win32') {
        return process.env['TEMP'] || "";
    }
    else {
        return '/tmp';
    }
}
exports.tmpDir = tmpDir;
// Returns the full path to a temporary script generated by the extension
// and used to parse any additional compiler switches that need to be sent to CppTools.
function parseCompilerArgsScriptFile() {
    let scriptFile = path.join(tmpDir(), "parseCompilerArgs");
    if (process.platform === "win32") {
        scriptFile += ".bat";
    }
    else {
        scriptFile += ".sh";
    }
    return scriptFile;
}
exports.parseCompilerArgsScriptFile = parseCompilerArgsScriptFile;
function getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : "";
}
exports.getWorkspaceRoot = getWorkspaceRoot;
// Evaluate whether a string looks like a path or not,
// without using fs.stat, since dry-run may output tools
// that are not found yet at certain locations,
// without running the prep targets that would copy them there
function looksLikePath(pathStr) {
    // TODO: to be implemented
    return true;
}
exports.looksLikePath = looksLikePath;
// Evaluate whether the tool is invoked from the current directory
function pathIsCurrentDirectory(pathStr) {
    // Ignore any spaces or tabs before the invocation
    pathStr = pathStr.trimLeft();
    if (pathStr === "") {
        return true;
    }
    if (process.platform === "win32" && process.env.MSYSTEM === undefined) {
        if (pathStr === ".\\") {
            return true;
        }
    }
    else {
        if (pathStr === "./") {
            return true;
        }
    }
    return false;
}
exports.pathIsCurrentDirectory = pathIsCurrentDirectory;
// Helper that searches for a tool in all the paths forming the PATH environment variable
// Returns the first one found or undefined if not found.
// TODO: implement a variation of this helper that scans on disk for the tools installed,
// to help when VSCode is not launched from the proper environment
function toolPathInEnv(name) {
    let envPath = process.env["PATH"];
    let envPathSplit = [];
    if (envPath) {
        envPathSplit = envPath.split(path.delimiter);
    }
    // todo: if the compiler is not found in path, scan on disk and point the user to all the options
    // (the concept of kit for cmake extension)
    return envPathSplit.find(p => {
        let fullPath = path.join(p, path.basename(name));
        // Often a path is added by the user to the PATH environment variable with surrounding quotes,
        // especially on Windows where they get automatically added after TAB.
        // These quotes become inner (not surrounding) quotes after we append various file names or do oher processing,
        // making file sysem stats fail. Safe to remove here.
        fullPath = removeQuotes(fullPath);
        if (checkFileExistsSync(fullPath)) {
            return fullPath;
        }
    });
}
exports.toolPathInEnv = toolPathInEnv;
function taskKill(pid) {
    return new Promise((resolve, reject) => {
        child_process.exec(`taskkill /pid ${pid} /T /F`, (error) => {
            if (error) {
                reject(error);
            }
            else {
                resolve();
            }
        });
    });
}
function killTree(progress, pid) {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.platform === 'win32') {
            try {
                yield taskKill(pid);
            }
            catch (e) {
                logger.message(`Failed to kill process ${pid}: ${e}`);
            }
            return;
        }
        let children = [];
        let stdoutStr = "";
        let stdout = (result) => {
            stdoutStr += result;
        };
        try {
            // pgrep should run on english, regardless of the system setting.
            const result = yield spawnChildProcess('pgrep', ['-P', pid.toString()], getWorkspaceRoot(), true, stdout);
            if (!!stdoutStr.length) {
                children = stdoutStr.split('\n').map((line) => Number.parseInt(line));
                logger.message(`Found children subprocesses: ${stdoutStr}.`);
                for (const other of children) {
                    if (other) {
                        yield killTree(progress, other);
                    }
                }
            }
        }
        catch (e) {
            logger.message(e.message);
            throw e;
        }
        try {
            logger.message(`Killing process PID = ${pid}`);
            progress.report({ increment: 1, message: `Terminating process PID=${pid} ...` });
            process.kill(pid, 'SIGINT');
        }
        catch (e) {
            if (e.code !== 'ESRCH') {
                throw e;
            }
        }
    });
}
exports.killTree = killTree;
function normalizeEnvironmentVarname(varname) {
    return process.platform === 'win32' ? varname.toUpperCase() : varname;
}
exports.normalizeEnvironmentVarname = normalizeEnvironmentVarname;
function mergeEnvironment(...env) {
    return env.reduce((acc, vars) => {
        if (process.platform === 'win32') {
            // Env vars on windows are case insensitive, so we take the ones from
            // active env and overwrite the ones in our current process env
            const norm_vars = Object.getOwnPropertyNames(vars).reduce((acc2, key) => {
                acc2[normalizeEnvironmentVarname(key)] = vars[key];
                return acc2;
            }, {});
            return Object.assign(Object.assign({}, acc), norm_vars);
        }
        else {
            return Object.assign(Object.assign({}, acc), vars);
        }
    }, {});
}
exports.mergeEnvironment = mergeEnvironment;
// Helper to spawn a child process, hooked to callbacks that are processing stdout/stderr
// forceEnglish is true when the caller relies on parsing english words from the output.
function spawnChildProcess(processName, args, workingDirectory, forceEnglish, stdoutCallback, stderrCallback) {
    const localeOverride = {
        LANG: "C",
        LC_ALL: "C"
    };
    // Use english language for this process regardless of the system setting.
    const environment = (forceEnglish) ? localeOverride : {};
    const finalEnvironment = mergeEnvironment(process.env, environment);
    return new Promise((resolve, reject) => {
        const child = child_process.spawn(`"${processName}"`, args, { cwd: workingDirectory, shell: true, env: finalEnvironment });
        make.setCurPID(child.pid);
        if (stdoutCallback) {
            child.stdout.on('data', (data) => {
                stdoutCallback(`${data}`);
            });
        }
        if (stderrCallback) {
            child.stderr.on('data', (data) => {
                stderrCallback(`${data}`);
            });
        }
        child.on('close', (returnCode, signal) => {
            resolve({ returnCode, signal });
        });
        child.on('exit', (returnCode) => {
            resolve({ returnCode, signal: "" });
        });
        if (child.pid === undefined) {
            reject(new Error(`Failed to spawn process: ${processName} ${args}`));
        }
    });
}
exports.spawnChildProcess = spawnChildProcess;
// Helper to eliminate empty items in an array
function dropNulls(items) {
    return items.filter(item => (item !== null && item !== undefined));
}
exports.dropNulls = dropNulls;
// Convert a posix path (/home/dir1/dir2/file.ext) into windows path,
// by calling the cygpah which comes installed with MSYS/MinGW environments
// and which is also aware of the drive under which /home/ is placed.
// result: c:\msys64\home\dir1\dir2\file.ext
// Called usually for Windows subsystems: MinGW, CygWin.
function cygpath(pathStr) {
    return __awaiter(this, void 0, void 0, function* () {
        let windowsPath = pathStr;
        let stdout = (result) => {
            windowsPath = result.replace(/\n/mg, ""); // remove the end of line
        };
        // Running cygpath can use the system locale.
        yield spawnChildProcess("cygpath", [pathStr, "-w"], "", false, stdout);
        return windowsPath;
    });
}
exports.cygpath = cygpath;
// Helper to reinterpret one relative path (to the given current path) printed by make as full path
function makeFullPath(relPath, curPath) {
    return __awaiter(this, void 0, void 0, function* () {
        let fullPath = relPath;
        if (!path.isAbsolute(fullPath) && curPath) {
            fullPath = path.join(curPath, relPath);
        }
        if (process.platform === "win32" && process.env.MSYSTEM !== undefined) {
            // invoke cygpath to find out where the posix home drive resides on the windows file system.
            fullPath = yield cygpath(fullPath);
        }
        return fullPath;
    });
}
exports.makeFullPath = makeFullPath;
// Helper to reinterpret the relative paths (to the given current path) printed by make as full paths
function makeFullPaths(relPaths, curPath) {
    return __awaiter(this, void 0, void 0, function* () {
        let fullPaths = [];
        for (const p of relPaths) {
            let fullPath = yield makeFullPath(p, curPath);
            fullPaths.push(fullPath);
        }
        return fullPaths;
    });
}
exports.makeFullPaths = makeFullPaths;
// Helper to reinterpret one full path as relative to the given current path
function makeRelPath(fullPath, curPath) {
    let relPath = fullPath;
    if (path.isAbsolute(fullPath) && curPath) {
        relPath = path.relative(curPath, fullPath);
    }
    return relPath;
}
exports.makeRelPath = makeRelPath;
// Helper to reinterpret the relative paths (to the given current path) printed by make as full paths
function makeRelPaths(fullPaths, curPath) {
    let relPaths = [];
    fullPaths.forEach(p => {
        relPaths.push(makeRelPath(p, curPath));
    });
    return fullPaths;
}
exports.makeRelPaths = makeRelPaths;
// Helper to remove any quotes(", ' or `) from a given string
// because many file operations don't work properly with paths
// having quotes in the middle.
function removeQuotes(str) {
    const quotesStr = ["'", '"', "`"];
    for (const p in quotesStr) {
        if (str.includes(quotesStr[p])) {
            let regExpStr = `${quotesStr[p]}`;
            let regExp = RegExp(regExpStr, 'g');
            str = str.replace(regExp, "");
        }
    }
    return str;
}
exports.removeQuotes = removeQuotes;
// Remove only the quotes (", ' or `) that are surrounding the given string.
function removeSurroundingQuotes(str) {
    let result = str.trim();
    const quotesStr = ["'", '"', "`"];
    for (const p in quotesStr) {
        if (result.startsWith(quotesStr[p]) && result.endsWith(quotesStr[p])) {
            result = result.substring(1, str.length - 1);
            return result;
        }
    }
    return str;
}
exports.removeSurroundingQuotes = removeSurroundingQuotes;
// Used when constructing a regular expression from file names which can contain
// special characters (+, ", ...etc...).
const escapeChars = /[\\\^\$\*\+\?\{\}\(\)\.\!\=\|\[\]\ \/]/; // characters that should be escaped.
function escapeString(str) {
    let escapedString = "";
    for (const char of str) {
        if (char.match(escapeChars)) {
            escapedString += `\\${char}`;
        }
        else {
            escapedString += char;
        }
    }
    return escapedString;
}
exports.escapeString = escapeString;
function elapsedTimeSince(start) {
    return (Date.now() - start) / 1000;
}
exports.elapsedTimeSince = elapsedTimeSince;
// Helper to evaluate whether two settings (objects or simple types) represent the same content.
// It recursively analyzes any inner subobjects and is also not affected
// by a different order of properties.
function areEqual(setting1, setting2) {
    if (setting1 === null || setting1 === undefined ||
        setting2 === null || setting2 === undefined) {
        return setting1 === setting2;
    }
    // This is simply type
    if (typeof (setting1) !== "function" && typeof (setting1) !== "object" &&
        typeof (setting2) !== "function" && typeof (setting2) !== "object") {
        return setting1 === setting2;
    }
    let properties1 = Object.getOwnPropertyNames(setting1);
    let properties2 = Object.getOwnPropertyNames(setting2);
    if (properties1.length !== properties2.length) {
        return false;
    }
    for (let p = 0; p < properties1.length; p++) {
        let property = properties1[p];
        let isEqual;
        if (typeof (setting1[property]) === 'object' && typeof (setting2[property]) === 'object') {
            isEqual = areEqual(setting1[property], setting2[property]);
        }
        else {
            isEqual = (setting1[property] === setting2[property]);
        }
        if (!isEqual) {
            return false;
        }
    }
    return true;
}
exports.areEqual = areEqual;
// Answers whether the given object has at least one property.
function hasProperties(obj) {
    if (obj === null || obj === undefined) {
        return false;
    }
    let props = Object.getOwnPropertyNames(obj);
    return props && props.length > 0;
}
exports.hasProperties = hasProperties;
// Apply any properties from source to destination, logging for overwrite.
// To make things simpler for the caller, create a valid dst if given null or undefined.
function mergeProperties(dst, src) {
    let props = src ? Object.getOwnPropertyNames(src) : [];
    props.forEach(prop => {
        if (!dst) {
            dst = {};
        }
        if (dst[prop] !== undefined) {
            logger.message(`Destination object already has property ${prop} set to ${dst[prop]}. Overwriting from source with ${src[prop]}`, "Debug");
        }
        dst[prop] = src[prop];
    });
    return dst;
}
exports.mergeProperties = mergeProperties;
function removeDuplicates(src) {
    let seen = {};
    let result = [];
    src.forEach(item => {
        if (!seen[item]) {
            seen[item] = true;
            result.push(item);
        }
    });
    return result;
}
exports.removeDuplicates = removeDuplicates;
function sortAndRemoveDuplicates(src) {
    return removeDuplicates(src.sort());
}
exports.sortAndRemoveDuplicates = sortAndRemoveDuplicates;
function reportDryRunError(dryrunOutputFile) {
    logger.message(`You can see the detailed dry-run output at ${dryrunOutputFile}`);
    logger.message("Make sure that the extension is invoking the same make command as in your development prompt environment.");
    logger.message("You may need to define or tweak a custom makefile configuration in settings via 'makefile.configurations' like described here: [link]");
    logger.message("Also make sure your code base does not have any known issues with the dry-run switches used by this extension (makefile.dryrunSwitches).");
    logger.message("If you are not able to fix the dry-run, open a GitHub issue in Makefile Tools repo: "
        + "https://github.com/microsoft/vscode-makefile-tools/issues");
}
exports.reportDryRunError = reportDryRunError;
// Helper to make paths absolute until the extension handles variables expansion.
function resolvePathToRoot(relPath) {
    if (!path.isAbsolute(relPath)) {
        return path.join(getWorkspaceRoot(), relPath);
    }
    return relPath;
}
exports.resolvePathToRoot = resolvePathToRoot;
// Schedule a task to be run at some future time. This allows other pending tasks to
// execute ahead of the scheduled task and provides a form of async behavior for TypeScript.
function scheduleTask(task) {
    return new Promise((resolve, reject) => {
        setImmediate(() => {
            try {
                const result = task();
                resolve(result);
            }
            catch (e) {
                reject(e);
            }
        });
    });
}
exports.scheduleTask = scheduleTask;
// Async version of scheduleTask
function scheduleAsyncTask(task) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            setImmediate(() => __awaiter(this, void 0, void 0, function* () {
                try {
                    const result = yield task();
                    resolve(result);
                }
                catch (e) {
                    reject(e);
                }
            }));
        });
    });
}
exports.scheduleAsyncTask = scheduleAsyncTask;
function thisExtension() {
    const ext = vscode.extensions.getExtension('ms-vscode.makefile-tools');
    if (!ext) {
        throw new Error("Our own extension is null.");
    }
    return ext;
}
exports.thisExtension = thisExtension;
function thisExtensionPackage() {
    const pkg = thisExtension().packageJSON;
    return {
        name: pkg.name,
        publisher: pkg.publisher,
        version: pkg.version,
        contributes: pkg.contributes
    };
}
exports.thisExtensionPackage = thisExtensionPackage;
function thisExtensionPath() { return thisExtension().extensionPath; }
exports.thisExtensionPath = thisExtensionPath;
//# sourceMappingURL=util.js.map