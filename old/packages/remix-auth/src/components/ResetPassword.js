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
exports.ResetPassword = void 0;
const react_1 = require("@chakra-ui/react");
const react_2 = require("@remix-run/react");
const React = __importStar(require("react"));
const ResetPassword = ({ isShowing, sessionClient, email, code, }) => {
    const [password, setPassword] = React.useState("");
    const [fieldErrors, setFieldErrors] = React.useState({});
    const [searchParams] = (0, react_2.useSearchParams)();
    const [formErrors, setFormErrors] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const resetPassword = async (e) => {
        e.preventDefault();
        setFieldErrors({});
        setIsLoading(true);
        try {
            await sessionClient.setNewPassword({
                username: email,
                code,
                newPassword: password,
                autoSignIn: {
                    enabled: true,
                }
            });
            let redirect = searchParams.get("redirect");
            if (redirect == null) {
                redirect = "/";
            }
            window.location.href = redirect;
        }
        catch (err) {
            setIsLoading(false);
            setFormErrors(err.message);
        }
    };
    return (<react_1.Fade in={isShowing}>
      <react_1.Box>
        <react_1.Heading>Set your password</react_1.Heading>
        <react_1.Text>You need to set a new password.</react_1.Text>
        <react_1.Box borderWidth="1px" borderRadius="lg" p="6" mt="3">
          <form onSubmit={resetPassword}>
            <react_1.FormControl mb="6">
              <react_1.FormLabel>New Password</react_1.FormLabel>
              <react_1.Input type="password" width="400px" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} isInvalid={fieldErrors.code != null}/>
              {fieldErrors.code != null && (<react_1.FormHelperText>{fieldErrors.code}</react_1.FormHelperText>)}
            </react_1.FormControl>
            <react_1.Button type="submit" variant="solid" colorScheme="green" isLoading={isLoading} isDisabled={isLoading}>
              Set Password
            </react_1.Button>
            {formErrors != null && (<react_1.Text mt="6" color="tomato" fontWeight="semibold">
                {formErrors}
              </react_1.Text>)}
          </form>
        </react_1.Box>
      </react_1.Box>
    </react_1.Fade>);
};
exports.ResetPassword = ResetPassword;
