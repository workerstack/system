FROM archlinux:base
RUN pacman -Syu --noconfirm curl unzip tar bash \
	&& pacman -Scc --noconfirm
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.4"
ENV PATH="/root/.bun/bin:${PATH}"
WORKDIR /src
