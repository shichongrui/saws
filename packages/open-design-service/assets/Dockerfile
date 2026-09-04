ARG OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:0.21.0
FROM ${OPEN_DESIGN_IMAGE}

ARG CODEX_VERSION=0.151.0
ARG CLAUDE_CODE_VERSION=2.1.252

USER root

RUN apk add --no-cache bash git libgcc libstdc++ ripgrep && \
    apk add --no-cache --virtual .gateway-build-deps python3 make g++ && \
    npm install --global --omit=dev --allow-scripts=@anthropic-ai/claude-code \
      "@openai/codex@${CODEX_VERSION}" \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" && \
    mkdir -p /opt/saws-open-design-gateway /agent-home /workspace && \
    chown -R open-design:open-design /agent-home /workspace

COPY --chown=open-design:open-design gateway/package.json /opt/saws-open-design-gateway/package.json
RUN cd /opt/saws-open-design-gateway && \
    npm install --omit=dev && \
    apk del .gateway-build-deps && \
    npm cache clean --force

COPY --chown=open-design:open-design gateway /opt/saws-open-design-gateway

USER open-design
