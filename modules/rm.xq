xquery version "3.1";

(: required parameter :)
declare variable $paths as xs:string+ external;

(: pattern matching - when empty, paths are removed as given :)
declare variable $include-patterns as xs:string* external;
declare variable $exclude-patterns as xs:string* external;

(: options :)
declare variable $dry-run as xs:boolean external;
declare variable $recursive as xs:boolean external;
declare variable $force as xs:boolean external;

(: paths that must never be removed :)
declare variable $protected-paths as xs:string* external;

declare variable $COLLECTION := "collection";
declare variable $RESOURCE := "resource";

declare function local:check-path ($path) {
    if (xmldb:collection-available($path))
    then $COLLECTION
    else if (util:binary-doc-available($path) or doc-available($path))
    then $RESOURCE
    else error(xs:QName('not_available'), $path || " does not exist")
};

declare function local:remove-resource ($path as xs:string) {
    let $parts := tokenize($path, '/')
    let $length := count($parts)
    let $resource := $parts[$length]
    let $collection := subsequence($parts, 1, $length - 1) => string-join('/')
    return (xmldb:remove($collection, $resource), true())
};

declare function local:remove ($path) {
    switch(local:check-path($path))
        case $COLLECTION return
            if (not($recursive))
            then error(xs:QName('non_recursive'), $path || " is a collection, but the recursive option is not set")
            else if (not($force) and exists((xmldb:get-child-resources($path), xmldb:get-child-collections($path))))
            then error(xs:QName('not_empty'), $path || " is a non-empty collection, but the force option is not set")
            else if ($dry-run)
            then true()
            else (xmldb:remove($path), true())
        case $RESOURCE return
            if ($dry-run)
            then true()
            else local:remove-resource($path)
    default return error(xs:QName('unknown_type'), $path || " is of unknown type")
};

declare function local:safe-remove ($path) {
    try {
        map {
            "path": $path,
            "success": local:remove($path)
        }
    }
    catch * {
        map {
            "path": $path,
            "success": false(),
            "error": map {
                "description": $err:description,
                "code": $err:code
            }
        }
    }
};

(:~ names are matched case-insensitively, excludes win over includes :)
declare function local:name-matches ($name as xs:string) as xs:boolean {
    (some $pattern in $include-patterns satisfies matches($name, $pattern, "i"))
    and not(some $pattern in $exclude-patterns satisfies matches($name, $pattern, "i"))
};

(:~ collect matching children of $collection, descending only when $recursive is set :)
declare function local:gather ($collection as xs:string) as map(*)* {
    let $resources := xmldb:get-child-resources($collection)
    let $collections := xmldb:get-child-collections($collection)
    return (
        for $resource in $resources
        where local:name-matches($resource)
        return map { "path": $collection || "/" || $resource, "type": $RESOURCE },
        for $child in $collections
        where local:name-matches($child)
        return map { "path": $collection || "/" || $child, "type": $COLLECTION },
        if ($recursive)
        then
            for $child in $collections
            return local:gather($collection || "/" || $child)
        else ()
    )
};

declare function local:removed ($results as map(*)*, $path as xs:string) as xs:boolean {
    some $result in $results satisfies ($result?path = $path and $result?success)
};

(:~
 : A collection can go when every one of its current children was (or, in a
 : dry run, would have been) removed by this query. Checking against the
 : accumulated results keeps real runs and dry runs identical.
 :)
declare function local:collection-empty ($results as map(*)*, $path as xs:string) as xs:boolean {
    every $child in (
        (xmldb:get-child-resources($path), xmldb:get-child-collections($path))
        ! ($path || "/" || .)
    )
    satisfies local:removed($results, $child)
};

declare function local:remove-matched-collection ($results as map(*)*, $path as xs:string) as map(*) {
    if (not($recursive))
    then map {
        "path": $path,
        "success": false(),
        "skipped": true(),
        "reason": "is a collection, but the recursive option is not set"
    }
    else if (not($force) and not(local:collection-empty($results, $path)))
    then map {
        "path": $path,
        "success": false(),
        "skipped": true(),
        "reason": "is a non-empty collection, but the force option is not set"
    }
    else map {
        "path": $path,
        "success":
            if ($dry-run)
            then true()
            else (xmldb:remove($path), true())
    }
};

declare function local:remove-match ($results as map(*)*, $match as map(*)) as map(*) {
    try {
        if ($match?path = $protected-paths)
        then map {
            "path": $match?path,
            "success": false(),
            "error": map {
                "description": $match?path || " is a protected path",
                "code": "protected"
            }
        }
        else if ($match?type = $RESOURCE)
        then map {
            "path": $match?path,
            "success":
                if ($dry-run)
                then true()
                else local:remove-resource($match?path)
        }
        else local:remove-matched-collection($results, $match?path)
    }
    catch * {
        map {
            "path": $match?path,
            "success": false(),
            "error": map {
                "description": $err:description,
                "code": $err:code
            }
        }
    }
};

(:~
 : Remove everything below the given base collections that matches the
 : patterns. Deletions run deepest-first so that collections emptied by
 : earlier removals can be removed on the way up.
 :)
declare function local:remove-matches () as map(*)* {
    let $unavailable :=
        for $base in $paths[not(xmldb:collection-available(.))]
        return map {
            "path": $base,
            "success": false(),
            "error": map {
                "description": $base || " is not an available collection",
                "code": "not_available"
            }
        }
    let $matches :=
        for $base in $paths[xmldb:collection-available(.)]
        return local:gather($base)
    let $deepest-first :=
        for $match in $matches
        order by count(tokenize($match?path, '/')) descending, $match?path ascending
        return $match
    return (
        $unavailable,
        fold-left(
            $deepest-first,
            (),
            function ($results, $match) {
                ($results, local:remove-match($results, $match))
            }
        )
    )
};

try {
    serialize(
        map{
            "list":
                if (exists(($include-patterns, $exclude-patterns)))
                then array { local:remove-matches() }
                else array:for-each(
                    array{ $paths }, local:safe-remove#1),
            "dryRun": $dry-run,
            "recursive": $recursive,
            "force": $force
        },
        map { "method": "json" }
    )
}
catch * {
    serialize(
        map {
            "error": map {
                "code": $err:code,
                "description": $err:description,
                "value": $err:value,
                "module": $err:module,
                "line-number": $err:line-number,
                "column-number": $err:column-number,
                "additional": $err:additional,
                "xquery-stack-trace": $exerr:xquery-stack-trace
            }
        },
        map { "method": "json" }
    )
}
