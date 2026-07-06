import { Host } from "@saws/host";
export function findConfiguredHosts(root) {
    const hosts = new Set();
    const visited = new Set();
    const visit = (service) => {
        if (visited.has(service))
            return;
        visited.add(service);
        const host = service.docker?.host;
        if (host instanceof Host)
            hosts.add(host);
        for (const dependency of service.dependencies)
            visit(dependency);
    };
    visit(root);
    return [...hosts];
}
