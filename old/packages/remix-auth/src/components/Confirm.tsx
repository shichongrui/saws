import { Box, Button, Fade, FormControl, FormHelperText, FormLabel, Heading, Input, Text } from '@chakra-ui/react';
import { useSearchParams } from '@remix-run/react';
import * as React from 'react'
import type { SessionClient } from "@saws/cognito/session-client";

type ConfirmProps = {
  email: string;
  isShowing: boolean;
  sessionClient: SessionClient
}

export const Confirm: React.FC<ConfirmProps> = ({ email, isShowing, sessionClient }) => {
  const [code, setCode] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = React.useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = React.useState(false);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setIsLoading(true);

    try {
      await sessionClient.confirmSignUp(email, code);

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
    <Fade in={isShowing}>
      <Box>
        <Heading>Confirm your email</Heading>
        <Text>Check your email for a confirmation code</Text>
        <Box borderWidth="1px" borderRadius="lg" p="6" mt="3">
          <form onSubmit={register}>
            <FormControl mb="3">
              <FormLabel>Code</FormLabel>
              <Input
                width="400px"
                required
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
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
              Confirm
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
}