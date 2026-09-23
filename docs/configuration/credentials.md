# Credentials

ATHENA owns TypeSafe credentials. The loader checks `ATHENA_CREDENTIALS`, XDG `athena/credentials`, `~/.config/athena/credentials`, then legacy `~/.athena/credentials`. The CLI writes user config with restrictive permissions and never prints the value. Run `athena setup` to validate and replace it.

Related: [documentation index](../README.md)
