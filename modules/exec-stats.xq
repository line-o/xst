xquery version "3.1";

(:~
 : Timing harness for `xst execute --stats`.
 :
 : Compiles and evaluates the query passed in $query, timing both steps
 : on the server, so network transport is never part of the reported numbers.
 :
 : The first item of the returned sequence is a JSON object with the measured
 : times in milliseconds. All following items are the results of the evaluated
 : query, untouched, so that the client retrieves and serializes them exactly
 : as it would without the stats option.
 :
 : Variable bindings sent by the client are declared in this query's context
 : by eXist-db and are visible from within util:eval, because the evaluated
 : expression inherits the current execution context (including its typed
 : variable declarations and the statically known documents).
 :
 : Measurement semantics:
 : - "compilation" is an isolated parse and analyze pass (util:compile-query).
 :   Its outcome is reported as "compile-check" but intentionally not acted
 :   upon; a query that cannot be compiled will raise the original error from
 :   util:eval below. A failed check can also be a false negative, because
 :   util:compile-query does not see the client's variable bindings.
 : - "execution" is the time util:eval takes. This includes an internal
 :   recompilation of the query - eXist-db offers no way to evaluate an
 :   already compiled query separately.
 : - $pass is set to true() so failing queries keep their original error
 :   location.
 :)

declare variable $query as xs:string external;

let $start := util:system-dateTime()
let $compile-check := util:compile-query($query, ())
let $compiled := util:system-dateTime()
let $result := util:eval($query, false(), (), true())
let $executed := util:system-dateTime()
return (
    serialize(
        map {
            "compilation": ($compiled - $start) div xs:dayTimeDuration("PT0.001S"),
            "execution": ($executed - $compiled) div xs:dayTimeDuration("PT0.001S"),
            "compile-check": string($compile-check/@result)
        },
        map { "method": "json" }
    ),
    $result
)
