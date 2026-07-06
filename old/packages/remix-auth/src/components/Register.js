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
exports.Register = void 0;
const react_1 = require("@chakra-ui/react");
const React = __importStar(require("react"));
const Register = ({ isShowing, onRegister, sessionClient }) => {
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const [fieldErrors, setFieldErrors] = React.useState({});
    const [formErrors, setFormErrors] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const register = async (e) => {
        e.preventDefault();
        setFieldErrors({});
        setIsLoading(true);
        if (confirmPassword !== password) {
            setFieldErrors((prev) => ({
                ...prev,
                confirmPassword: "Passwords do not match",
            }));
            return;
        }
        try {
            const res = await sessionClient.signUp({
                username: email,
                password,
                attributes: {
                    email,
                },
                autoSignIn: {
                    enabled: true,
                }
            });
            if (res == null)
                return;
            onRegister({
                userId: res.userSub,
                email: res.user.getUsername()
            });
            setIsLoading(false);
        }
        catch (err) {
            setIsLoading(false);
            if (err instanceof Error) {
                if (err.name === "UsernameExistsException") {
                    setFieldErrors((prev) => ({
                        ...prev,
                        email: "That email is already in use by another account.",
                    }));
                    return;
                }
                setFormErrors(err.message);
                return;
            }
            setFormErrors("There was a problem signing up. Please try again later.");
        }
    };
    return (<react_1.Fade in={isShowing}>
      <react_1.Box>
        <react_1.Heading>Let's get started</react_1.Heading>
        <react_1.Box borderWidth="1px" borderRadius="lg" p="6" mt="3">
          <form onSubmit={register}>
            <react_1.FormControl mb="3">
              <react_1.FormLabel>Email</react_1.FormLabel>
              <react_1.Input type="email" width="400px" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} isInvalid={fieldErrors.email != null}/>
              {fieldErrors.email != null && (<react_1.FormHelperText>{fieldErrors.email}</react_1.FormHelperText>)}
            </react_1.FormControl>
            <react_1.FormControl mb="6">
              <react_1.FormLabel>Password</react_1.FormLabel>
              <react_1.Input type="password" width="400px" required value={password} isInvalid={fieldErrors.confirmPassword != null} onChange={(e) => setPassword(e.currentTarget.value)}/>
            </react_1.FormControl>
            <react_1.FormControl mb="6">
              <react_1.FormLabel>Confirm Password</react_1.FormLabel>
              <react_1.Input type="password" width="400px" required value={confirmPassword} isInvalid={fieldErrors.confirmPassword != null} onChange={(e) => setConfirmPassword(e.currentTarget.value)}/>
              {fieldErrors.confirmPassword != null && (<react_1.FormHelperText>Confirm password does not match</react_1.FormHelperText>)}
            </react_1.FormControl>
            <react_1.Button type="submit" variant="solid" colorScheme="green" isLoading={isLoading} isDisabled={isLoading}>
              Sign Up
            </react_1.Button>
            {formErrors != null && (<react_1.Text mt="6" color="tomato" fontWeight="semibold">
                {formErrors}
              </react_1.Text>)}
          </form>
        </react_1.Box>
      </react_1.Box>
    </react_1.Fade>);
};
exports.Register = Register;
