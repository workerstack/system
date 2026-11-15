FROM fedora:41
RUN dnf install -y curl unzip tar xz bash sudo git which \
	&& dnf clean all
# installs run as a normal user, as on a real machine: makepkg and VS Code refuse root. uid 1001 is the GitHub runner's, which keeps the mounted checkout writable.
RUN useradd -m -u 1001 builder && echo "builder ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/builder
RUN curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s "bun-v1.4.4"
# the mounted checkout belongs to the host user, and git refuses a repo another user owns
RUN git config --system --add safe.directory /src
WORKDIR /src
