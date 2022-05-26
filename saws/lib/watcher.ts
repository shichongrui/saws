import watch from "node-watch";
import { HandlerRef } from "./dev-server";

export const startWatcher = async (handlerRef: HandlerRef, modulePath: string, build: Function) => {
    await build();
    watch('.', { recursive: true, filter: (f, skip) => {
        // skip node_modules
        if (/node_modules/.test(f)) return skip;
        // skip .git folder
        if (/\.git/.test(f)) return skip;
        return true;
    }}, async () => {
        console.log('Detected changes, rebuilding');
        await build();
        delete require.cache[require.resolve(modulePath)];
        const module = require(modulePath).default;
        handlerRef.current = module.apolloServer.createHandler();
        console.log('ready');
    });

}