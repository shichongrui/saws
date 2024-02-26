import { Box, Button, Flex, Text } from "@chakra-ui/react";
import * as React from "react";
import { Login } from "../components/Login";
import { Register } from "../components/Register";
import { Confirm } from "../components/Confirm";
import { CompleteNewPassword } from "../components/CompleteNewPassword";
import type { SessionClient } from "@shichongrui/saws-cognito/session-client";
import { useSearchParams } from "@remix-run/react";
import { ResetPassword } from "../components/ResetPassword";
import { useEffect } from "react";

type AuthenticateRouteProps = {
  sessionClient: SessionClient;
  allowUserSignUp?: boolean;
};

type Flow =
  | "login"
  | "register"
  | "confirm"
  | "completeNewPassword"
  | "resetPassword";

export const AuthenticateRoute: React.FC<AuthenticateRouteProps> = ({
  sessionClient,
  allowUserSignUp = true,
}) => {
  const [searchParams] = useSearchParams();
  const [flow, setFlow] = React.useState<Flow>(
    (searchParams.get("flow") as Flow) ?? "login"
  );
  const [user, setUser] = React.useState<any>(null);
  const [userArgs, setUserArgs] = React.useState<Record<string, string>>({});

  useEffect(() => {
    if (flow === "register" && !allowUserSignUp) {
      setFlow("login");
    }
  }, [flow, allowUserSignUp]);

  return (
    <Flex minHeight="100vh">
      <Box bgGradient="linear(to-b, green.400, teal.200)" flex="1"></Box>
      <Flex flex="2" alignItems="center" justifyContent="center">
        <Box position="relative">
          {flow === "login" && (
            <Login
              sessionClient={sessionClient}
              isShowing={flow === "login"}
              onRequiresNewPassword={(user) => {
                setUser(user);
                setFlow("completeNewPassword");
              }}
              onRequiresConfirmation={(email) => {
                setUserArgs({
                  email,
                });
                setFlow("confirm");
              }}
              onRequiresResetPassword={(email, code) => {
                setUserArgs({
                  email,
                  code,
                });
                setFlow("resetPassword");
              }}
            />
          )}
          {flow === "register" && allowUserSignUp && (
            <Register
              sessionClient={sessionClient}
              isShowing={flow === "register"}
              onRegister={(args) => {
                setFlow("confirm");
                setUserArgs(args);
              }}
            />
          )}
          {flow === "confirm" && (
            <Confirm
              sessionClient={sessionClient}
              isShowing={flow === "confirm"}
              email={userArgs.email}
            />
          )}
          {flow === "completeNewPassword" && (
            <CompleteNewPassword sessionClient={sessionClient} user={user} />
          )}
          {flow === "resetPassword" && (
            <ResetPassword
              sessionClient={sessionClient}
              email={userArgs.email}
              code={userArgs.code}
              isShowing={true}
            />
          )}
          {allowUserSignUp && (
            <Text fontWeight="semibold" mt="6" ml="6">
              {flow === "login"
                ? "Need an account "
                : "Already have an account "}
              <Button
                onClick={() =>
                  setFlow((prev) => (prev === "login" ? "register" : "login"))
                }
                variant="link"
                colorScheme="green"
              >
                {flow === "login" ? "Create an Account" : "Sign In"}
              </Button>
            </Text>
          )}
        </Box>
      </Flex>
    </Flex>
  );
};
