
```
  ╲ ╱  ╓───  ──┰──
   ╳   ╰───╮   │  
  ╱ ╲  ▂▁▁▁│   ┇  

  A modern command line interface for exist-db
```

[![version][version-image]][version-url]
[![Conventional Commits][ccommits-image]][ccommits-url]
[![javascript style guide][standard-image]][standard-url]

[![Semantic Release](https://github.com/eXist-db/xst/actions/workflows/semantic-release.yml/badge.svg)](https://github.com/eXist-db/xst/actions/workflows/semantic-release.yml)
[![CodeQL](https://github.com/eXist-db/xst/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/eXist-db/xst/actions/workflows/codeql-analysis.yml)

[version-image]: https://img.shields.io/npm/v/@existdb/xst.svg?style=flat
[version-url]: https://www.npmjs.com/package/@existdb/xst
[ccommits-image]: https://img.shields.io/badge/Conventional%20Commits-1.0.0-blue?logo=conventionalcommits&logoColor=white
[ccommits-url]: https://conventionalcommits.org
[standard-image]: https://img.shields.io/badge/code_style-standard-blue.svg
[standard-url]: https://standardjs.com
Built on top of [@existdb/node-exist](https://www.npmjs.com/package/@existdb/node-exist).

## Installation

Prerequisite: [nodeJS](https://nodejs.org/) version 18 or later

`npm install --global @existdb/xst`

This will put the executable `xst` in your path.

### Updating

To update to the latest version of `xst`

```bash
npm update --global @existdb/xst
```

## Usage

```bash
xst <command>
```

You can verify your installation is working with

```bash
xst --version
```

Output commands and options

```bash
xst --help
```

You can use --help with any command to get additional information on how to use it.

```bash
xst <command> --help
```

**Available Commands**

| command                                    | description                                 | aliases             |
|--------------------------------------------|---------------------------------------------|---------------------|
| `info`                                     | Gather system information                   |                     |
| `get [options] <source> <target>`          | Download a collection or resource           | `download` `fetch`  |
| `upload [options] <source> <target>`       | Upload files and directories.               | `up`                |
| `remove [options] <paths..>`               | Remove collections or resources             | `rm` `delete` `del` |
| `edit [options] <resource>`                | Edit a resource in a local editor           |                     |
| `execute [<query>] [options]`              | Execute a query string or file              | `run` `exec`        |
| `list [options] <collection>`              | List collection contents                    | `ls`                |
| `package list [options]`                   | List installed packages                     | `pkg ls`            |
| `package install <command>`                | Install XAR packages from various sources   | `pkg i <command>`   |
| `package uninstall [options] <packages..>` | Remove XAR packages (does check dependents) | `pkg uninstall`.    |

### Examples

#### List collections

```bash
xst list /db
```

#### List the entire contents of the apps collection

This will output extended and colored information of all collections and resources of `/db/apps` in a tree.

```bash
xst list /db/apps --long --tree --color
```

**NOTE:** Resources and collections the connecting user does not have access to will be omitted with --long.

#### Find the largest JavaScript resource

```bash
xst list /db/apps --long --recursive --color --glob '*.js' --sizesort
```

#### Download a resource

This will download the controller of the dashboard to the current working directory.

```bash
xst get /db/apps/dashboard/controller.xql .
```

#### Download a collection

If the target is a collection, a folder with the same name will be created at the
specified target and all of its contents will be downloaded.

```bash
xst get /db/apps/dashboard .
```

The above downloads the contents of the collection `/db/apps/dashboard` into the
`dashboard` folder in the current working directory.

#### Set the permission for a resource

This demonstrates how you can extend the current functionality by running arbitrary
scripts. You need to connnect as a database administrator to be able to run the
queries.

```bash
xst execute 'sm:chmod(xs:anyURI($file), $permissions)' \
  -b '{"file": "/db/apps/dashboard/controller.xql", "permissions": "rwxrwxr-x"}'
```

Reset the permissions back to their original state.

```bash
xst execute 'sm:chmod(xs:anyURI($file), $permissions)' \
  -b '{"file": "/db/apps/dashboard/controller.xql", "permissions": "rwxr-xr-x"}'
```

#### Executing a main module

If you find yourself using the same query over and over again or it is a complex one
you can save it to a file and use the `--file` parameter.

```bash
xst execute --file my-query.xq
```

#### Installation of XAR packages

NOTE: The user initiating the command must be a member of the DBA group.

Package installation will attempt to resolve and install all dependencies declare in repo.xml. Installation will fail, if a dependency could not be found or could not be installed.
The default registry (AKA public-repo) is `https://exist-db.org/exist/apps/public-repo` but can be overridden with the `--registry` option.

##### From a registry

```bash
xst package install from-registry demo-apps
```

##### One or more local files

```bash
xst package install local-files path/to/*.xar
```

#### List all installed application packages with their dependencies

```bash
xst package list --applications --dependencies
```

#### Uninstall a package

NOTE: The user initiating the command must be a member of the DBA group.

```bash
xst package uninstall demo-apps
```


## Configuration

By default `xst` connects to https://localhost:8443 as user guest.

**NOTE:** The instance you want to connect to must be running and XML-RPC has to be enabled.

### With a Configuration File

`xst` now supports configuration files. The global `--config` option expects a path to a readable
configuration file. Currently three different formats are recognized.

**Example**

```bash
xst ls /db/apps --config spec/fixtures/.xstrc
```

#### .xstrc

A JSON formatted file where you can set connection options as well as other preferred settings like
`color` or `timesort`. Have a look at the [example .xstrc](spec/fixtures/.xstrc).

**NOTE:** The boolean option "secure" is deprecated. To switch between encrypted and unencrypted
connections use "protocol" instead. "secure" will continue to work for both XMLRPC and REST until
version 2.

#### .existdb.json

These are present in projects using the sync feature from eXistdb's Visual Studio Code plugin.

#### dotenv files

```bash
EXISTDB_USER=admin
EXISTDB_PASS=my super secret p455w0rd!
EXISTDB_SERVER=http://localhost:8080
```

**NOTE:** If the current working directory contains an .env file
it will be loaded automatically unless the --config parameter is set.

### With Environment Variables

Override any of the default connection parameters by setting environment
variables prefixed with `EXISTDB`. In the following table you see a list of the
parameters with their default values and a description.

| variable name   | default                  | description                                                                                |
|-----------------|--------------------------|--------------------------------------------------------------------------------------------|
| `EXISTDB_USER`  | `guest`                  | the user used to connect to the database and to execute queries with                       |
| `EXISTDB_PASS`  | `guest`                  | the password to authenticate the user against the database                                 |
| `EXISTDB_SERVER`| `https://localhost:8443` | the URL of the database instance to connect to (only http and https protocols are allowed) |

**Example**

```
EXISTDB_SERVER=http://127.0.0.1:8080 xst ls /db/apps
```

## Development

If you want to test or develop this package further follow the steps below

1. clone this repository
    ```bash
    git clone https://github.com/line-o/xst
    ```

2. change to the working directory
    ```bash
    cd xst
    ```

3. install package dependencies
    ```bash
    npm install
    ```

4. link this package into your global packages directory
    ```bash
    npm link
    ```

**Note:** With this setup `--version` will always output `0.0.0-development`.

## Testing

Once you followed the above steps and linked a local clone of this repository
run the testsuite with

```bash
npm test
```

**NOTE:** The test suite runs against a real eXist-db instance — either a local
development instance you already have, or one started with the harness below.

### Running a test instance

The `harness/` directory has a Docker-based helper that starts an isolated
eXist-db, points the suite at it, and cleans up afterwards — no global install,
no port juggling, and closer to what CI does:

```bash
harness/xst-harness.sh up      # start eXist-db (existdb/existdb:release)
harness/xst-harness.sh test    # npm test against it
harness/xst-harness.sh down    # stop and remove it
```

It can also start a REST-disabled instance for `npm run test:norest`, run a
version matrix, and give several isolated instances (e.g. one per git worktree)
their own ports. See [harness/README.md](harness/README.md) for the full set of
commands and options.

### Coverage

If you want to get test code coverage information run 

```bash
npm run coverage
```

**NOTE:** You will need to have an instance of existdb running (usually a local development instance).

### No REST

Additional tests in `spec/norest/**/*.js` ensure that everything keeps working even
on instances where the REST API is disabled. You can run those with

```bash
npm run test:norest
```

**NOTE:** Keep in mind they will only run successfully against an instance that actually has REST disabled
(`harness/xst-harness.sh up --norest` starts one).
The [Test - No REST](.github/workflows/test-no-rest.yml) GitHub Action makes use of this.

## Contributing

We are happy to accept contributions from the community.
Contributions can be just a typo in the readme or better documentation,
as well as bugfixes and new features.
For bugfixes and features it is best to open an issue, so that
we can discuss your approach first. That way your PR will
be merged quickly.

When committing to this project each commit message must conform
to [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/) as versioning and
releases are automated using [semantic-release](https://semantic-release.gitbook.io/semantic-release/).

### commitlint

If you want to check your commits while developing you can add a pre-commit-hook with
[husky](https://typicode.github.io/husky/#/).

Activate husky for this project

```bash
npx husky
```

This will add to git hooks

- **pre-commit** `npm run lint` ensures any JS is formatted correctly and will prevent you from
  committing when it encounters problems like unused variables and such.
- **commit-msg** will run commitlint to ensure the commit message is following conventional commit
  message format

These are not activated by default as it prevents you from doing work-in-progress commits.
But keep in mind, both checks will run when you open a PR, so it might be easier
to have this checked right from the start and not having to edit your history later.
