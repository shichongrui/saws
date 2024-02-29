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
import { useSearchParams } from "@remix-run/react";
import * as React from "react";
import type { CognitoUser } from "amazon-cognito-identity-js";
import type { SessionClient } from "@saws/cognito/session-client";

type CompleteNewPasswordProps = {
  user: CognitoUser;
  sessionClient: SessionClient;
};

export const CompleteNewPassword: React.FC<CompleteNewPasswordProps> = ({
  user,
  sessionClient,
}) => {
  const [newPassword, setNewPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const [formErrors, setFormErrors] = React.useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = React.useState(false);

  const completeNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setIsLoading(true);

    try {
      await sessionClient.completeNewPassword(user, newPassword);
      let redirect = searchParams.get("redirect");
      if (redirect == null) {
        redirect = "/";
      }
      window.location.href = redirect;
    } catch (err) {
      setIsLoading(false);
      setFormErrors((err as Error).message);
    }
  };

  return (
    <Fade in>
      <Box>
        <Heading>Set your password</Heading>
        <Text>You need to set a new password.</Text>
        <Box borderWidth="1px" borderRadius="lg" p="6" mt="3">
          <form onSubmit={completeNewPassword}>
            <FormControl mb="3">
              <FormLabel>New Password</FormLabel>
              <Input
                width="400px"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.currentTarget.value)}
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
