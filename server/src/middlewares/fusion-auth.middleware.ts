import {Middleware, MiddlewareMethods} from '@tsed/platform-middlewares';
import {Context, Locals} from '@tsed/platform-params';
import {Constant} from '@tsed/cli-core';
import {Unauthorized} from '@tsed/exceptions';

/**
 * FusionAuth middleware
 *
 * Checks if the user is logged in and has a valid access token
 */
@Middleware()
export class FusionAuthMiddleware implements MiddlewareMethods {

    @Constant('envs.FUSIONAUTH_SERVER_URL')
    private baseUrl: string;

    @Constant('envs.FUSIONAUTH_CLIENT_ID')
    private clientId: string;

    async use(@Context() $ctx: Context, @Locals() locals: any) {
        const {access_token} = $ctx.request.cookies;

        if (access_token) {
            // Check if the access token is valid
            await fetch(`${this.baseUrl}/oauth2/introspect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    'token': access_token,
                    'client_id': this.clientId
                })
            })
                .then(response => response.json())
                .then(data => {
                    // If the access token is valid, set the user
                    if (data.active) {
                        locals.user = data;
                    } else {
                        this.throwAuthError()
                    }
                });
        } else {
            this.throwAuthError()
        }
    }

    throwAuthError() {
        throw new Unauthorized('You are not authorized to access this resource');
    }

}
