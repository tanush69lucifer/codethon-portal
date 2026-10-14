# Sandbox image for running candidate Java code.
# Build once on the judge host:  docker build -t codethon-java-runner:latest judge/
# The worker starts one short-lived container per submission with:
#   --network none, read-only rootfs, tmpfs /tmp, memory/cpu/pids limits, all caps dropped, non-root user.
FROM eclipse-temurin:21-jdk-jammy

COPY runner.sh /runner.sh
RUN chmod 0755 /runner.sh

# No proxy/agent options leaking into candidate programs.
ENV HOME=/tmp JAVA_TOOL_OPTIONS="" JDK_JAVA_OPTIONS="" LANG=C.UTF-8

USER 65534:65534
WORKDIR /tmp
ENTRYPOINT ["/bin/bash", "/runner.sh"]
