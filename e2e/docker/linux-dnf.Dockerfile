FROM fedora:41
RUN dnf install -y curl unzip tar xz bash sudo git which \
	&& dnf clean all
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"
ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /src
