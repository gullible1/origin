from flask import request
from flask_restful import Resource
from marshmallow import fields
from logic.verification_service import VerificationService
from api.helpers import StandardRequest, StandardResponse, handle_request


class PhoneVerificationCodeRequest(StandardRequest):
    eth_address = fields.Str(required=True, data_key='eth-address')
    phone = fields.Str(required=True)


class PhoneVerificationCodeResponse(StandardResponse):
    pass


class VerifyPhoneRequest(StandardRequest):
    eth_address = fields.Str(required=True, data_key='eth-address')
    phone = fields.Str(required=True)
    code = fields.Str(required=True)


class VerifyPhoneResponse(StandardResponse):
    signature = fields.Str()
    claim_type = fields.Str(data_key='claim-type')
    data = fields.Str(required=True)


class EmailVerificationCodeRequest(StandardRequest):
    eth_address = fields.Str(required=True, data_key='eth-address')
    email = fields.Str(required=True)


class EmailVerificationCodeResponse(StandardResponse):
    pass


class VerifyEmailRequest(StandardRequest):
    eth_address = fields.Str(required=True, data_key='eth-address')
    email = fields.Str(required=True)
    code = fields.Str(required=True)


class VerifyEmailResponse(StandardResponse):
    signature = fields.Str()
    claim_type = fields.Str(data_key='claim-type')
    data = fields.Str()


class FacebookAuthUrlRequest(StandardRequest):
    redirect_url = fields.Str(required=True, data_key='redirect-url')


class FacebookAuthUrlResponse(StandardResponse):
    url = fields.Str()


class VerifyFacebookRequest(StandardRequest):
    eth_address = fields.Str(required=True, data_key='eth-address')
    code = fields.Str(required=True)
    redirect_url = fields.Str(required=True, data_key='redirect-url')


class VerifyFacebookResponse(StandardResponse):
    signature = fields.Str()
    claim_type = fields.Str(data_key='claim-type')
    data = fields.Str()


class TwitterAuthUrlRequest(StandardRequest):
    pass


class TwitterAuthUrlResponse(StandardResponse):
    url = fields.Str()


class VerifyTwitterRequest(StandardRequest):
    eth_address = fields.Str(required=True, data_key='eth-address')
    oauth_verifier = fields.Str(required=True, data_key='oauth-verifier')


class VerifyTwitterResponse(StandardResponse):
    signature = fields.Str()
    claim_type = fields.Str(data_key='claim-type')
    data = fields.Str()


class PhoneVerificationCode(Resource):
    def post(self):
        return handle_request(
            data=request.json,
            handler=VerificationService.generate_phone_verification_code,
            request_schema=PhoneVerificationCodeRequest,
            response_schema=PhoneVerificationCodeResponse)


class VerifyPhone(Resource):
    def post(self):
        return handle_request(
            data=request.json,
            handler=VerificationService.verify_phone,
            request_schema=VerifyPhoneRequest,
            response_schema=VerifyPhoneResponse)


class EmailVerificationCode(Resource):
    def post(self):
        return handle_request(
            data=request.json,
            handler=VerificationService.generate_email_verification_code,
            request_schema=EmailVerificationCodeRequest,
            response_schema=EmailVerificationCodeResponse)


class VerifyEmail(Resource):
    def post(self):
        return handle_request(
            data=request.json,
            handler=VerificationService.verify_email,
            request_schema=VerifyEmailRequest,
            response_schema=VerifyEmailResponse)


class FacebookAuthUrl(Resource):
    def post(self):
        return handle_request(
            data=request.json,
            handler=VerificationService.facebook_auth_url,
            request_schema=FacebookAuthUrlRequest,
            response_schema=FacebookAuthUrlResponse)


class VerifyFacebook(Resource):
    def post(self):
        return handle_request(
            data=request.json,
            handler=VerificationService.verify_facebook,
            request_schema=VerifyFacebookRequest,
            response_schema=VerifyFacebookResponse)


class TwitterAuthUrl(Resource):
    def post(self):
        return handle_request(
            data=request.json,
            handler=VerificationService.twitter_auth_url,
            request_schema=TwitterAuthUrlRequest,
            response_schema=TwitterAuthUrlResponse)


class VerifyTwitter(Resource):
    def post(self):
        return handle_request(
            data=request.json,
            handler=VerificationService.verify_twitter,
            request_schema=VerifyTwitterRequest,
            response_schema=VerifyTwitterResponse)


resources = {
    # 'hello-world-path': HelloWorldResource
    'generate-phone-verification-code': PhoneVerificationCode,
    'verify-phone': VerifyPhone,
    'generate-email-verification-code': EmailVerificationCode,
    'verify-email': VerifyEmail,
    'facebook-auth-url': FacebookAuthUrl,
    'verify-facebook': VerifyFacebook,
    'twitter-auth-url': TwitterAuthUrl,
    'verify-twitter': VerifyTwitter
}
