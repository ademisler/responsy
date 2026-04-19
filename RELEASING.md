# Releasing Responsy

Responsy uses semantic versioning and annotated Git tags in the `vX.Y.Z` format.

## Tag Format

- Valid: `v1.0.0`
- Valid: `v1.4.2`
- Invalid: `1.0.0`
- Invalid: `release-1.0.0`

Only tags matching `v*.*.*` trigger the GitHub release workflow.

## Release Checklist

1. Update `package.json` version.
2. Move release notes from `Unreleased` into a new dated section in [CHANGELOG.md](./CHANGELOG.md).
3. Run the local checks:

```bash
npm install
npm run check
npm run pack:mac
npm run pack:win
```

4. Commit the release changes.
5. Create an annotated tag:

```bash
git tag -a v1.0.0 -m "Responsy v1.0.0"
```

6. Push the branch and the tag:

```bash
git push origin main
git push origin v1.0.0
```

7. Confirm the `Release` GitHub Actions workflow finishes successfully.
8. Verify the GitHub Release contains the macOS and Windows artifacts.

## Notes

- Keep version numbers in sync with the changelog.
- Do not create release tags from unreviewed or unverified commits.
- Use annotated tags instead of lightweight tags for public releases.
