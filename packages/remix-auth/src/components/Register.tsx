import {
  Box,
  Button,
  Fade,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  Text,
} from "@chakra-ui/react";
import * as React from "react";
import type { SessionClient } from "@shichongrui/saws-cognito/session-client";

type RegisterProps = {
  sessionClient: SessionClient;
  isShowing: boolean;
  onRegister: (userArgs: Record<string, string>) => void
};

export const Register: React.FC<RegisterProps> = ({ isShowing, onRegister, sessionClient }) => {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const register = async (e: React.FormEvent) => {
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

      if (res == null) return;

      onRegister({
        userId: res.userSub,
        email: res.user.getUsername()
      })
      setIsLoading(false)
    } catch (err) {
      setIsLoading(false)
      if (err instanceof Error) {
        if (err.name === "UsernameExistsException") {
          setFieldErrors((prev) => ({
            ...prev,
            email: "That email is already in use by another account.",
          }));
          return;
        }
        setFormErrors(err.message);
        return
      }
      setFormErrors("There was a problem signing up. Please try again later.")
    }
  };

  return (
    <Fade in={isShowing}>
      <Box>
        <Heading>Let's get started</Heading>
        <Box borderWidth="1px" borderRadius="lg" p="6" mt="3">
          <form onSubmit={register}>
            <FormControl mb="3">
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                width="400px"
                required
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                isInvalid={fieldErrors.email != null}
              />
              {fieldErrors.email != null && (
                <FormHelperText>{fieldErrors.email}</FormHelperText>
              )}
            </FormControl>
            <FormControl mb="6">
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                width="400px"
                required
                value={password}
                isInvalid={fieldErrors.confirmPassword != null}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
            </FormControl>
            <FormControl mb="6">
              <FormLabel>Confirm Password</FormLabel>
              <Input
                type="password"
                width="400px"
                required
                value={confirmPassword}
                isInvalid={fieldErrors.confirmPassword != null}
                onChange={(e) => setConfirmPassword(e.currentTarget.value)}
              />
              {fieldErrors.confirmPassword != null && (
                <FormHelperText>Confirm password does not match</FormHelperText>
              )}
            </FormControl>
            <Button
              type="submit"
              variant="solid"
              colorScheme="green"
              isLoading={isLoading}
              isDisabled={isLoading}
            >
              Sign Up
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
