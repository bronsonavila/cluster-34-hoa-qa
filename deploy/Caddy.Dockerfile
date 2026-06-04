# Caddy with the non-standard rate_limit module (per-IP request throttling for
# the public chat webhook). The directive ships outside core Caddy, so we build
# a custom binary with xcaddy and drop it into the standard alpine runtime.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
