"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticateRoute = void 0;
const react_1 = require("@chakra-ui/react");
const React = __importStar(require("react"));
const Login_1 = require("../components/Login");
const Register_1 = require("../components/Register");
const Confirm_1 = require("../components/Confirm");
const CompleteNewPassword_1 = require("../components/CompleteNewPassword");
const react_2 = require("@remix-run/react");
const ResetPassword_1 = require("../components/ResetPassword");
const react_3 = require("react");
const AuthenticateRoute = ({ sessionClient, allowUserSignUp = true, }) => {
    const [searchParams] = (0, react_2.useSearchParams)();
    const [flow, setFlow] = React.useState(searchParams.get("flow") ?? "login");
    const [user, setUser] = React.useState(null);
    const [userArgs, setUserArgs] = React.useState({});
    (0, react_3.useEffect)(() => {
        if (flow === "register" && !allowUserSignUp) {
            setFlow("login");
        }
    }, [flow, allowUserSignUp]);
    return (<react_1.Flex minHeight="100vh">
      <react_1.Box bgGradient="linear(to-b, green.400, teal.200)" flex="1"></react_1.Box>
      <react_1.Flex flex="2" alignItems="center" justifyContent="center">
        <react_1.Box position="relative">
          {flow === "login" && (<Login_1.Login sessionClient={sessionClient} isShowing={flow === "login"} onRequiresNewPassword={(user) => {
                setUser(user);
                setFlow("completeNewPassword");
            }} onRequiresConfirmation={(email) => {
                setUserArgs({
                    email,
                });
                setFlow("confirm");
            }} onRequiresResetPassword={(email, code) => {
                setUserArgs({
                    email,
                    code,
                });
                setFlow("resetPassword");
            }}/>)}
          {flow === "register" && allowUserSignUp && (<Register_1.Register sessionClient={sessionClient} isShowing={flow === "register"} onRegister={(args) => {
                setFlow("confirm");
                setUserArgs(args);
            }}/>)}
          {flow === "confirm" && (<Confirm_1.Confirm sessionClient={sessionClient} isShowing={flow === "confirm"} email={userArgs.email}/>)}
          {flow === "completeNewPassword" && (<CompleteNewPassword_1.CompleteNewPassword sessionClient={sessionClient} user={user}/>)}
          {flow === "resetPassword" && (<ResetPassword_1.ResetPassword sessionClient={sessionClient} email={userArgs.email} code={userArgs.code} isShowing={true}/>)}
          {allowUserSignUp && (<react_1.Text fontWeight="semibold" mt="6" ml="6">
              {flow === "login"
                ? "Need an account "
                : "Already have an account "}
              <react_1.Button onClick={() => setFlow((prev) => (prev === "login" ? "register" : "login"))} variant="link" colorScheme="green">
                {flow === "login" ? "Create an Account" : "Sign In"}
              </react_1.Button>
            </react_1.Text>)}
        </react_1.Box>
      </react_1.Flex>
    </react_1.Flex>);
};
exports.AuthenticateRoute = AuthenticateRoute;
