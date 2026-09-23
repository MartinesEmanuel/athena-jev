# Installation

The intended public path is:

```sh
npm install -g athena-jev
athena install
athena setup
opencode
```

`athena install` detects OpenCode 1.x or 2.x and writes only ATHENA-owned integration files under the user OpenCode plugin directory. It does not edit OpenCode source or unrelated plugins. `athena setup` validates a TypeSafe credential before saving it. For offline setup use `athena install --demo`.

The publishable package dependency set is still release-blocked; see [limitations](../research/limitations.md).
