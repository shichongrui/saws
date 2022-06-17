import { getProjectName } from "./get-project-name"

export const getDBName = () => {
    const projectName = getProjectName();
    return `${projectName.replace(/[^a-zA-Z\d]/g, "_")}_${process.env.STAGE}`;
}