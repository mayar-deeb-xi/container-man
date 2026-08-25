// class-transformer and class-validator read decorator metadata through the global
// Reflect polyfill; Nest's main.ts imports this in the real app, the tests here.
import "reflect-metadata";
