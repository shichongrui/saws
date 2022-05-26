import watch from "node-watch";
import { HandlerRef } from "./dev-server";

export const startWatcher = (handlerRef: HandlerRef, modulePath: string, rebuild: Function, ) => {
    watch('.', { recursive: true, filter: (f, skip) => {
        // skip node_modules
        if (/node_modules/.test(f)) return skip;
        // skip .git folder
        if (/\.git/.test(f)) return skip;
        return true;
    }}, async () => {
        console.log('Detected changes, rebuilding');
        await rebuild();
        delete require.cache[require.resolve(modulePath)];
        const module = require(modulePath).default;
        handlerRef.current = module.apolloServer.createHandler();
        console.log('ready');
    });

}