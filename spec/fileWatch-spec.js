// /* global describe it expect beforeEach afterEach waitsForPromise */
//
// 'use babel';
//
// const Path = require('path');
// const Promise = require('bluebird');
// // const FsExtra = require('fs-extra');
//
// const FileWatch = require('../src/fileWatch.js');
//
// describe('FileWatch Tests', () => {
//     beforeEach(function backUpWorkingDir() {
//         this.workingDir = process.cwd();
//     });
//
//     afterEach(function restoreWorkingDir() {
//         process.chdir(this.workingDir);
//     });
//
//     it('starts', () => {
//         const fileWatch = FileWatch('*.test', {
//             usePolling: true,
//             interval: 200
//         });
//
//         expect(fileWatch).toBeDefined();
//         expect(fileWatch.onUpdate).toBeDefined();
//         expect(fileWatch.destroy).toBeDefined();
//
//         fileWatch.destroy();
//     });
//
//     it('Never calls onUpdate when no files exist', () => {
//         waitsForPromise(() =>
//             new Promise((resolve) => {
//                 process.chdir(Path.join(__dirname, 'fixtures/testFiles/noFiles'));
//
//                 const fileWatch = FileWatch('*.test', {
//                     usePolling: true,
//                     interval: 200
//                 });
//
//                 let called = false;
//
//                 fileWatch.onUpdate(() => {
//                     called = true;
//                 });
//
//                 let instance = 0;
//
//                 setInterval(() => {
//                     expect(called).toBe(false);
//
//                     if (instance === 0) {
//                         instance += 1;
//
//                         fileWatch.destroy();
//                     } else {
//                         clearInterval();
//
//                         resolve();
//                     }
//                 }, 500);
//             }).catch((err) => {
//                 console.log(err);
//             })
//         );
//     });
//
//     it('Calls onUpdate when a file exists', () => {
//         waitsForPromise(() =>
//             new Promise((resolve) => {
//                 process.chdir(Path.join(__dirname, 'fixtures/testFiles/singleFile'));
//
//                 const fileWatch = FileWatch('*.test', {
//                     usePolling: true,
//                     interval: 200
//                 });
//
//                 let called = false;
//                 const expectFile = 'fileA.foo.test';
//                 let expectContents = 'foo';
//
//                 fileWatch.onUpdate((file, contents) => {
//                     called = true;
//
//                     expect(file).toBe(expectFile);
//                     expect(contents).toBe(expectContents);
//                 });
//
//                 let instance = 0;
//
//                 const testInterval = setInterval(() => {
//                     expect(called).toBe(true);
//
//                     if (instance === 0) {
//                         instance += 1;
//
//                         called = false;
//                         expectContents = undefined;
//
//                         fileWatch.destroy();
//                     } else {
//                         clearInterval(testInterval);
//
//                         resolve();
//                     }
//                 }, 500);
//             }).catch((err) => {
//                 console.log(err);
//             })
//         );
//     });
//
//     it('Calls onUpdate when a file exists on a double watcher when one is destroyed', () => {
//         waitsForPromise(() =>
//             new Promise((resolve) => {
//                 process.chdir(Path.join(__dirname, 'fixtures/testFiles/singleFile'));
//
//                 const fileWatchA = FileWatch('*.test', {
//                     usePolling: true,
//                     interval: 200
//                 });
//
//                 const fileWatchB = FileWatch('*.test', {
//                     usePolling: true,
//                     interval: 200
//                 });
//
//                 let calledA = false;
//                 let calledB = false;
//                 const expectFile = 'fileA.foo.test';
//                 let expectContentsA = 'foo';
//                 const expectContentsB = 'foo';
//
//                 fileWatchA.onUpdate((file, contents) => {
//                     calledA = true;
//
//                     expect(file).toBe(expectFile);
//                     expect(contents).toBe(expectContentsA);
//                 });
//
//                 fileWatchB.onUpdate((file, contents) => {
//                     calledB = true;
//
//                     expect(file).toBe(expectFile);
//                     expect(contents).toBe(expectContentsB);
//                 });
//
//                 let instance = 0;
//
//                 const testInterval = setInterval(() => {
//                     if (instance === 0) {
//                         expect(calledA).toBe(true);
//                         expect(calledB).toBe(true);
//                         instance += 1;
//
//                         calledA = false;
//                         calledB = false;
//                         expectContentsA = undefined;
//
//                         fileWatchA.destroy();
//                     } else {
//                         expect(calledA).toBe(true);
//                         expect(calledB).toBe(false);
//                         clearInterval(testInterval);
//
//                         resolve();
//                     }
//                 }, 500);
//             }).catch((err) => {
//                 console.log(err);
//             })
//         );
//     });
//
//     it('Calls onUpdate when a file exists on a double watcher when both are destroyed', () => {
//         waitsForPromise(() =>
//             new Promise((resolve) => {
//                 process.chdir(Path.join(__dirname, 'fixtures/testFiles/singleFile'));
//
//                 const fileWatchA = FileWatch('*.test', {
//                     usePolling: true,
//                     interval: 200
//                 });
//
//                 const fileWatchB = FileWatch('*.test', {
//                     usePolling: true,
//                     interval: 200
//                 });
//
//                 let calledA = false;
//                 let calledB = false;
//                 const expectFile = 'fileA.foo.test';
//                 let expectContents = 'foo';
//
//                 fileWatchA.onUpdate((file, contents) => {
//                     calledA = true;
//
//                     expect(file).toBe(expectFile);
//                     expect(contents).toBe(expectContents);
//                 });
//
//                 fileWatchB.onUpdate((file, contents) => {
//                     calledB = true;
//
//                     expect(file).toBe(expectFile);
//                     expect(contents).toBe(expectContents);
//                 });
//
//                 let instance = 0;
//
//                 const testInterval = setInterval(() => {
//                     expect(calledA).toBe(true);
//                     expect(calledB).toBe(true);
//
//                     if (instance === 0) {
//                         instance += 1;
//
//                         calledA = false;
//                         calledB = false;
//                         expectContents = undefined;
//
//                         fileWatchA.destroy();
//                         fileWatchB.destroy();
//                     } else {
//                         clearInterval(testInterval);
//
//                         resolve();
//                     }
//                 }, 500);
//             }).catch((err) => {
//                 console.log(err);
//             })
//         );
//     });
// });