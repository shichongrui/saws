import {
  Box,
  Button,
  Fade,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  Input,
  SlideFade,
  Text,
} from "@chakra-ui/react";
import { useSearchParams } from "@remix-run/react";
import type { SessionClient } from "@saws/cognito/session-client";
import * as React from "react";

type ResetPasswordProps = {
  isShowing: boolean;
  sessionClient: SessionClient;
  email: string;
  code: string;
};

export const ResetPassword: React.FC<ResetPasswordProps> = ({
  isShowing,
  sessionClient,
  email,
  code,
}) => {
  const [password, setPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const [searchParams] = useSearchParams();
  const [formErrors, setFormErrors] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setIsLoading(true)
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
    } catch (err) {
      setIsLoading(false)
      setFormErrors((err as Error).message);
    }
  };

  return (
    <Fade in={isShowing}>
      <Box>
        <Heading>Set your password</Heading>
        <Text>You need to set a new password.</Text>
        <Box borderWidth="1px" borderRadius="lg" p="6" mt="3">
          <form onSubmit={resetPassword}>
            <FormControl mb="6">
              <FormLabel>New Password</FormLabel>
              <Input
                type="password"
                width="400px"
                required
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                isInvalid={fieldErrors.code != null}
              />
              {fieldErrors.code != null && (
                <FormHelperText>{fieldErrors.code}</FormHelperText>
              )}
            </FormControl>
            <Button
              type="submit"
              variant="solid"
              colorScheme="green"
              isLoading={isLoading}
              isDisabled={isLoading}
            >
              Set Password
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
