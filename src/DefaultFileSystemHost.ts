﻿import * as fs from "fs";
import * as globby from "globby";
import {FileSystemHost} from "./FileSystemHost";
import {FileUtils} from "./utils";

/**
 * @internal
 */
export class DefaultFileSystemHost implements FileSystemHost {
    readFile(filePath: string, encoding = "utf-8") {
        return fs.readFileSync(filePath, encoding);
    }

    writeFile(filePath: string, fileText: string) {
        return new Promise<void>((resolve, reject) => {
            fs.writeFile(filePath, fileText, err => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }

    writeFileSync(filePath: string, fileText: string) {
        fs.writeFileSync(filePath, fileText);
    }

    mkdir(dirPath: string) {
        return new Promise<void>((resolve, reject) => {
            fs.mkdir(dirPath, err => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }

    mkdirSync(dirPath: string) {
        fs.mkdirSync(dirPath);
    }

    fileExists(filePath: string) {
        return new Promise<boolean>((resolve, reject) => {
            fs.stat(filePath, (err, stat) => {
                if (err)
                    resolve(false);
                else
                    resolve(stat.isFile());
            });
        });
    }

    fileExistsSync(filePath: string) {
        try {
            return fs.statSync(filePath).isFile();
        } catch (err) {
            return false;
        }
    }

    directoryExists(dirPath: string) {
        return new Promise<boolean>((resolve, reject) => {
            fs.stat(dirPath, (err, stat) => {
                if (err)
                    resolve(false);
                else
                    resolve(stat.isDirectory());
            });
        });
    }

    directoryExistsSync(dirPath: string) {
        try {
            return fs.statSync(dirPath).isDirectory();
        } catch (err) {
            return false;
        }
    }

    getCurrentDirectory() {
        return FileUtils.getCurrentDirectory();
    }

    glob(patterns: string[]) {
        return globby.sync(patterns);
    }
}
