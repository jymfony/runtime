const { basename, dirname, join } = require('path');

try {
    require('@jymfony/autoloader');
} catch (e) {
    if ('MODULE_NOT_FOUND' === e.code) {
        require(__dirname + '/../Autoloader');
    } else {
        throw e;
    }
}

const nullish = (value, cond) => ((undefined === value) || (null === value)) ? cond() : value;
const AwsLambdaRunnerInterface = Jymfony.Component.Runtime.Runner.Jymfony.AwsLambdaRunnerInterface;

const awsLambdaTaskRoot = process.env.LAMBDA_TASK_ROOT;
const awsHandler = process.env._HANDLER;
const FUNCTION_EXPR = /^([^.]*)\.(.*)$/;

/**
 * Break the full handler string into two pieces, the module root and the actual
 * handler string.
 * Given './somepath/something/module.nestedobj.handler' this returns
 * ['./somepath/something', 'module.nestedobj.handler']
 */
const _moduleRootAndHandler = function(fullHandlerString) {
    const handlerString = basename(fullHandlerString);
    const moduleRoot = fullHandlerString.substring(
        0,
        fullHandlerString.indexOf(handlerString),
    );
    return [ moduleRoot, handlerString ];
};

/**
 * Split the handler string into two pieces: the module name and the path to
 * the handler function.
 */
const _splitHandlerString = function(handler) {
    const match = handler.match(FUNCTION_EXPR);
    if (!match || 3 != match.length) {
        throw new Error('Bad handler');
    }

    return [ match[1], match[2] ]; // [module, function-path]
};

const [ moduleRoot, moduleAndHandler ] = _moduleRootAndHandler(awsHandler);
const [ module ] = _splitHandlerString(moduleAndHandler);

const file = require.resolve(join(awsLambdaTaskRoot, moduleRoot, module));

let runtime = nullish(process.env.APP_RUNTIME, () => Jymfony.Component.Runtime.JymfonyRuntime);
const reflection = new ReflectionClass(runtime);
runtime = reflection.newInstance(Object.assign({ project_dir: dirname(file) }, nullish(globalThis.APP_RUNTIME_OPTIONS, () => ({}))));

module.exports = function (init) {
    let started = false;
    let [ app, args ] = runtime.getResolver(init).resolve();

    return async function (event, context) {
        if (! started) {
            app = await app(...args);
            started = true;
        }

        const runner = runtime.getRunner(app);
        if (runner instanceof AwsLambdaRunnerInterface) {
            runner.setEvent(event);
            runner.setContext(context);
        }

        return runner.run();
    };
};