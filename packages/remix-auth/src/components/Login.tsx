import {
  Box,
  Button,
  Fade,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Text,
} from "@chakra-ui/react";
import { useSearchParams } from "@remix-run/react";
import * as React from "react";
import type { SessionClient } from "@shichongrui/saws-cognito/session-client";

type LoginProps = {
  sessionClient: SessionClient;
  isShowing: boolean;
  onRequiresConfirmation: (email: string) => void;
  onRequiresNewPassword: (user: any) => void;
  onRequiresResetPassword: (email: string, code: string) => void;
};

export const Login: React.FC<LoginProps> = ({
  sessionClient,
  isShowing,
  onRequiresConfirmation,
  onRequiresNewPassword,
  onRequiresResetPassword,
}) => {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = React.useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = React.useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const user = await sessionClient.signIn(email, password);
      
      if (user.challengeName === "NEW_PASSWORD_REQUIRED") {
        onRequiresNewPassword(user)
        return
      }
      let redirect = searchParams.get("redirect");
      if (redirect == null) {
        redirect = "/";
      }
      window.location.href = redirect;
    } catch (err) {
      setIsLoading(false);
      if (err instanceof Error) {
        if (err.name === "UserNotFoundException") {
          setFormErrors("No account exists for that email.");
        }

        if (
          err.name === "NotAuthorizedException" ||
          err.name === "InvalidPasswordException"
        ) {
          setFormErrors("The password is not correct.");
        }

        if (err.name === "UserNotConfirmedException") {
          onRequiresConfirmation(email);
          return;
        }

        if (err.name === "PasswordResetRequiredException") {
          onRequiresResetPassword(email, password)
        }
      }
      setFormErrors("There was a problem signing in. Please try again later.")
    }
  };

  return (
    <Fade in={isShowing}>
      <Box>
        <Heading>Welcome back</Heading>
        <Box borderWidth="1px" borderRadius="lg" p="6" mt="3">
          <form onSubmit={login}>
            <FormControl mb="3">
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                width="400px"
                required
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
              />
            </FormControl>
            <FormControl mb="6">
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                width="400px"
                required
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
            </FormControl>
            <Button
              type="submit"
              variant="solid"
              colorScheme="green"
              isLoading={isLoading}
              isDisabled={isLoading}
            >
              Sign In
            </Button>
            {formErrors != null && (
              <Text mt="6" color="tomato" fontWeight="semibold">
                {formErrors}
              </Text>
            )}
          </form>
        </Box>
      </Box>
    </Fade>
  );
};
