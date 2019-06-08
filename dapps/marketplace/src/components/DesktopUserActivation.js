import React, { Component } from 'react'
import { Mutation } from 'react-apollo'
import { fbt } from 'fbt-runtime'

import pick from 'lodash/pick'

import withConfig from 'hoc/withConfig'
import withWallet from 'hoc/withWallet'
import withIsMobile from 'hoc/withIsMobile'
import withIdentity from 'hoc/withIdentity'

import Steps from './Steps'
import ImageCropper from './ImageCropper'
import Avatar from './Avatar'
import DeployIdentity from 'pages/identity/mutations/DeployIdentity'
import UserProfileCreated from './_UserProfileCreated'
import MobileModal from './MobileModal'
import Modal from './Modal'

import GenerateEmailCodeMutation from 'mutations/GenerateEmailCode'
import VerifyEmailCodeMutation from 'mutations/VerifyEmailCode'

import { uploadImages } from 'utils/uploadImages'
import { formInput, formFeedback } from 'utils/formHelpers'

import {
  updateVerifiedAccounts,
  getVerifiedAccounts,
  clearVerifiedAccounts
} from 'utils/profileTools'

import Store from 'utils/store'

const store = Store('sessionStorage')

class UserActivation extends Component {
  constructor(props) {
    super(props)

    let state = {
      stage: 'AddEmail',
      step: 1,
      firstName: '',
      lastName: ''
    }

    const storedAccounts = getVerifiedAccounts({ wallet: this.props.wallet })
    if (storedAccounts && storedAccounts.emailAttestation) {
      state = {
        ...state,
        stage: 'PublishDetail',
        data: storedAccounts.emailAttestation,
        step: 2
      }
    }

    const storedUserData = this.getStoredUserData()
    if (storedUserData) {
      state = {
        ...state,
        ...storedUserData
      }
    }

    this.state = {
      ...state,
      loading: false,
      error: null,
      email: '',
      code: '',
      firstNameError: null
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.props.stage && this.props.stage !== prevProps.stage) {
      this.setState(
        {
          stage: this.props.stage
        },
        () => this.onStageChanged()
      )
    } else if (this.state.stage !== prevState.stage) {
      this.onStageChanged()
    }

    this.updateStoredUserData({
      firstName: this.state.firstName,
      lastName: this.state.lastName,
      avatar: this.state.avatar,
      avatarUrl: this.state.avatarUrl
    })
  }

  render() {
    const {
      stage,
      step,
      personalDataModal,
      shouldClosePersonalDataModal,
      txModal,
      shouldCloseSignTxModal
    } = this.state
    const { renderMobileVersion, hideHeader } = this.props

    let stepHeader

    const isMobile = this.props.ismobile === 'true'

    const ModalComp = isMobile ? MobileModal : Modal

    if (!hideHeader) {
      stepHeader =
        stage === 'ProfileCreated' ? null : (
          <>
            <h2 className="step-title">
              {stage !== 'PublishDetail' && (
                <fbt desc="UserActivation.addYourEmail">Add your email</fbt>
              )}
              {stage === 'PublishDetail' && (
                <fbt desc="UserActivation.addNameAndPhoto">
                  Add name and photo
                </fbt>
              )}
            </h2>
            <Steps steps={2} step={step} />
          </>
        )
    }

    return (
      <div
        className={`user-activation${
          renderMobileVersion ? ' mobile' : ' desktop'
        }`}
      >
        {stepHeader}
        <div>{this[`render${stage}`]()}</div>
        {personalDataModal && (
          <ModalComp
            closeOnEsc={false}
            shouldClose={shouldClosePersonalDataModal}
            className="user-activation personal-data-modal"
            fullscreen={false}
            onClose={() =>
              this.setState({
                personalDataModal: false,
                shouldClosePersonalDataModal: false
              })
            }
          >
            {this.renderPersonalDataModal()}
          </ModalComp>
        )}
        {txModal && (
          <ModalComp
            closeOnEsc={false}
            shouldClose={shouldCloseSignTxModal}
            className="user-activation sign-tx-modal"
            fullscreen={false}
            onClose={() =>
              this.setState({
                txModal: false,
                shouldCloseSignTxModal: false
              })
            }
          >
            {this.renderSignTxModal()}
          </ModalComp>
        )}
      </div>
    )
  }

  renderAddEmail() {
    const { renderMobileVersion } = this.props

    const headerText = renderMobileVersion ? (
      <fbt desc="UserActivation.enterValidEmail">
        Enter a valid email address
      </fbt>
    ) : (
      <fbt desc="UserActivation.whatsYourEmail">What’s your email address?</fbt>
    )

    return (
      <Mutation
        mutation={GenerateEmailCodeMutation}
        onCompleted={({ generateEmailCode: result }) => {
          if (result.success) {
            this.setState(
              {
                stage: 'VerifyEmail',
                loading: false
              },
              () => this.onStageChanged()
            )
          } else {
            this.setState({
              error: result.reason,
              loading: false
            })
          }
        }}
        onError={errorData => {
          console.error('Error', errorData)
          this.setState({ error: 'Check console', loading: false })
        }}
      >
        {generateCode => (
          <form
            onSubmit={e => {
              e.preventDefault()
              if (this.state.loading) return
              this.setState({ error: null, loading: true })

              const emailRegex = /^[a-z0-9-._+]+@[a-z0-9-]+\.([a-z]{2,4})(\.[a-z]{2,4})?$/i
              if (!emailRegex.test(this.state.email)) {
                this.setState({
                  error: 'This is not a valid email address',
                  loading: false
                })
                return
              }

              generateCode({
                variables: {
                  email: this.state.email
                }
              })
            }}
          >
            <div className="boxed-container">
              <h3>{headerText}</h3>
              <div className="mt-3">
                <input
                  type="email"
                  className="form-control form-control-lg text-center"
                  placeholder="username@email.com"
                  value={this.state.email}
                  onChange={e => this.setState({ email: e.target.value })}
                />
              </div>
              {this.state.error && (
                <div className="alert alert-danger mt-3">
                  {this.state.error}
                </div>
              )}
              <div className="help mt-3">
                <fbt desc="UserActivation.emailHelp ">
                  We use your email to send you important notifications when you
                  buy or sell.
                </fbt>
              </div>
            </div>
            <div className="info">
              <span className="title">
                <fbt desc="UserActivation.visibleOnBlockchain">
                  What will be visible on the blockchain?
                </fbt>
              </span>
              <fbt desc="UserActivation.verifiedButNotEmail">
                That you have a verified email, but NOT your actual email
                address
              </fbt>
            </div>
            <div className="actions">
              <button
                type="submit"
                className="btn btn-primary mt-3 mb-3"
                children={
                  this.state.loading
                    ? fbt('Loading...', 'Loading...')
                    : fbt('Continue', 'Continue')
                }
              />
            </div>
          </form>
        )}
      </Mutation>
    )
  }

  renderVerifyEmail() {
    const { email, code } = this.state
    const { renderMobileVersion } = this.props

    const headerText = renderMobileVersion ? (
      <fbt desc="UserActivation.codeSentToEmail">We emailed you a code</fbt>
    ) : (
      <fbt desc="UserActivation.checkYourEmail">Please check your email</fbt>
    )

    const placeholderText = renderMobileVersion
      ? fbt('Enter verification code', 'UserActivation.enterVerificationCode')
      : fbt('Enter code', 'UserActivation.enterCode')

    return (
      <Mutation
        mutation={GenerateEmailCodeMutation}
        onCompleted={({ generateEmailCode: result }) => {
          if (result.success) {
            this.setState({
              resending: false
            })
          } else {
            this.setState({
              error: result.reason,
              resending: false
            })
          }
        }}
        onError={errorData => {
          console.error('Error', errorData)
          this.setState({ error: 'Check console', loading: false })
        }}
      >
        {generateCode => (
          <Mutation
            mutation={VerifyEmailCodeMutation}
            onCompleted={({ verifyEmailCode: result }) => {
              if (result.success) {
                this.setState(
                  {
                    stage: 'PublishDetail',
                    loading: false,
                    step: 2,
                    data: result.data
                  },
                  () => this.onStageChanged()
                )
                updateVerifiedAccounts({
                  wallet: this.props.walletProxy,
                  data: {
                    emailAttestation: result.data
                  }
                })
              } else {
                this.setState({
                  error: result.reason,
                  loading: false
                })
              }
            }}
            onError={errorData => {
              console.error('Error', errorData)
              this.setState({ error: 'Check console', loading: false })
            }}
          >
            {verifyCode => (
              <form
                onSubmit={e => {
                  e.preventDefault()
                  if (this.state.loading) return
                  this.setState({ error: false, loading: true })

                  const trimmedCode = this.state.code.trim()

                  if (trimmedCode.length !== 6 || isNaN(trimmedCode)) {
                    this.setState({
                      error: 'Verification code should be a 6 digit number',
                      loading: false
                    })
                    return
                  }

                  verifyCode({
                    variables: { identity: this.props.wallet, email, code }
                  })
                }}
              >
                <div className="boxed-container">
                  <h3>{headerText}</h3>
                  <div className="mt-3">
                    <input
                      type="tel"
                      maxLength="6"
                      className="form-control form-control-lg"
                      placeholder={placeholderText}
                      value={this.state.code}
                      onChange={e => this.setState({ code: e.target.value })}
                    />
                  </div>
                  {this.state.error && (
                    <div className="alert alert-danger mt-3">
                      {this.state.error}
                    </div>
                  )}
                  <div className="help mt-3">
                    <fbt desc="UserActivation.emailHelp ">
                      We sent a code to the email address you provided. Please
                      enter it above.
                    </fbt>
                    <a
                      onClick={() => {
                        if (this.state.resending) return
                        this.setState({
                          resending: true
                        })
                        generateCode({
                          variables: {
                            email: this.state.email
                          }
                        })
                      }}
                    >
                      {this.state.resending ? (
                        <fbt desc="UserActivation.resending">Resending...</fbt>
                      ) : (
                        <fbt desc="UserActivation.resendCode">Resend Code</fbt>
                      )}
                    </a>
                  </div>
                </div>
                <div className="info">
                  <span className="title">
                    <fbt desc="UserActivation.visibleOnBlockchain">
                      What will be visible on the blockchain?
                    </fbt>
                  </span>
                  <fbt desc="UserActivation.verifiedButNotEmail">
                    That you have a verified email, but NOT your actual email
                    address
                  </fbt>
                </div>
                <div className="actions">
                  <button
                    type="submit"
                    className="btn btn-primary mt-3 mb-3"
                    disabled={this.state.code.length !== 6}
                    children={
                      this.state.loading
                        ? fbt('Loading...', 'Loading...')
                        : fbt('Verify', 'Verify')
                    }
                  />
                </div>
              </form>
            )}
          </Mutation>
        )}
      </Mutation>
    )
  }

  onDeployComplete = () => {
    clearVerifiedAccounts()
    this.clearStoredUserData()
    if (this.props.renderMobileVersion) {
      this.setState(
        {
          stage: 'ProfileCreated'
        },
        () => this.onStageChanged()
      )
      return
    } else if (this.props.onCompleted) {
      this.props.onCompleted()
    }
    this.props.identityRefetch()
  }

  renderPublishDetail() {
    const input = formInput(this.state, state => this.setState(state))
    const Feedback = formFeedback(this.state)

    const { renderMobileVersion, config } = this.props

    const headerText = renderMobileVersion ? null : (
      <fbt desc="UserActivation.addNameAndPhoto">Add name and photo</fbt>
    )

    return (
      <form
        onSubmit={e => {
          e.preventDefault()
          if (this.validate()) {
            this.setState({
              txModal: true
            })
          }
        }}
      >
        <h3>{headerText}</h3>
        <div className="boxed-container">
          <div className="avatar-wrap mt-3">
            <ImageCropper
              onChange={async avatar => {
                const { ipfsRPC } = config
                const uploadedImages = await uploadImages(ipfsRPC, [avatar])
                const avatarImg = uploadedImages[0]
                if (avatarImg) {
                  const avatarUrl = avatarImg.url
                  this.setState({ avatar, avatarUrl })
                }
              }}
            >
              <Avatar className="with-cam" avatarUrl={this.state.avatarUrl} />
            </ImageCropper>
            {Feedback('avatar')}
          </div>
          <div className="mt-5">
            {renderMobileVersion && <fbt desc="firstName">First Name</fbt>}
            <input
              type="text"
              {...input('firstName')}
              placeholder={
                renderMobileVersion ? '' : fbt('First Name', 'firstName')
              }
            />
            {Feedback('firstName')}
          </div>
          <div className="mt-3">
            {renderMobileVersion && <fbt desc="lastName">Last Name</fbt>}
            <input
              type="text"
              {...input('lastName')}
              placeholder={
                renderMobileVersion ? '' : fbt('Last Name', 'lastName')
              }
            />
            {Feedback('lastName')}
          </div>
          {this.state.error && (
            <div className="alert alert-danger mt-3">{this.state.error}</div>
          )}
        </div>
        <div className="info yellow">
          <span className="title">
            <fbt desc="UserActivation.visibleOnBlockchain">
              What will be visible on the blockchain?
            </fbt>
          </span>
          <fbt desc="UserActivation.nameAndPhoto">Your name and photo.</fbt>
          <a
            href="#"
            onClick={e => {
              e.preventDefault()
              this.setState({
                personalDataModal: true
              })
            }}
          >
            <fbt desc="UserActivation.learnMore">Learn more</fbt>
          </a>
        </div>
        <div className="actions">
          <button
            type="submit"
            className="btn btn-primary mt-3 mb-3"
            children={fbt('Publish', 'Publish')}
          />
        </div>
      </form>
    )
  }

  renderProfileCreated() {
    return (
      <UserProfileCreated
        onCompleted={() => {
          if (this.props.onCompleted) {
            this.props.onCompleted()
          }

          this.props.identityRefetch()
        }}
      />
    )
  }

  renderPersonalDataModal() {
    return (
      <>
        <div className="header-image">
          <img src="images/tout-header-image.png" alt="header-image" />
        </div>
        <div className="padded-content">
          <h2>
            <fbt desc="UserActivation.blockchainAndPersonalData">
              Blockchain &amp; Your Personal Data
            </fbt>
          </h2>
          <p>
            <fbt desc="UserActivation.personalDataInfo">
              By creating a profile, you are associating your name and photo
              with your Ethereum account. This means that others will be able to
              connect your blockchain transactions to your name and photo.
            </fbt>
          </p>
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() =>
                this.setState({ shouldClosePersonalDataModal: true })
              }
            >
              Got it
            </button>
          </div>
        </div>
      </>
    )
  }

  renderSignTxModal() {
    const { walletType } = this.props
    const attestations = [this.state.data]

    return (
      <>
        <div className="header-image">
          <img src="images/tout-header-image.png" alt="header-image" />
        </div>
        <div className="padded-content">
          <h2>
            <fbt desc="UserActivation.signToPublish">Sign to Publish</fbt>
          </h2>
          <p>
            <fbt desc="UserActivation.signToCreateWallet">
              <fbt:param name="walletType">{walletType}</fbt:param> will now ask
              you to sign your profile creation data.
            </fbt>
          </p>
          <div className="actions">
            <DeployIdentity
              className="btn btn-primary mt-3 mb-3"
              identity={this.props.wallet}
              profile={pick(this.state, [
                'firstName',
                'lastName',
                'avatar',
                'avatarUrl'
              ])}
              attestations={attestations}
              validate={() => this.validate()}
              children={fbt('Publish', 'Publish')}
              skipSuccessScreen={true}
              onComplete={() => {
                this.setState({ shouldCloseSignTxModal: true }, () =>
                  this.onDeployComplete()
                )
              }}
            />
          </div>
        </div>
      </>
    )
  }

  validate() {
    let newState = {
      firstNameError: null,
      lastNameError: null,
      valid: true
    }

    if (!this.state.firstName) {
      newState = {
        ...newState,
        valid: false,
        firstNameError: fbt(
          'First Name is required',
          'UserActivation.firstNameRequired'
        )
      }
    }

    if (!this.state.lastName) {
      newState = {
        ...newState,
        valid: false,
        lastNameError: fbt(
          'Last Name is required',
          'UserActivation.lastNameRequired'
        )
      }
    }

    this.setState(newState)

    return newState.valid
  }

  onStageChanged() {
    if (this.props.onStageChanged) {
      this.props.onStageChanged(this.state.stage)
    }
  }

  getStoredUserData() {
    return store.get('user-activation-data')
  }

  updateStoredUserData(newData) {
    store.set('user-activation-data', {
      ...store.get('user-activation-data'),
      ...newData
    })
  }

  clearStoredUserData() {
    store.set('user-activation-data', undefined)
  }
}

export default withIsMobile(
  withConfig(withWallet(withIdentity(UserActivation)))
)

require('react-styl')(`
  .user-activation
    padding: 20px
    .step-title
      font-family: var(--heading-font)
      font-size: 28px
      font-weight: 300
      font-style: normal
      color: var(--dark)
      margin-bottom: 0.75rem
    .boxed-container
      border-radius: 5px
      border: solid 1px #c2cbd3
      background-color: var(--white)
      padding: 20px
      > h3
        background: url(images/identity/verification-shape-grey.svg) no-repeat center
        background-size: 7rem
        padding-top: 9rem
        background-position: center top
        position: relative
        text-align: center
        &::before
          content: ""
          position: absolute
          top: 0
          left: 0
          height: 7.5rem
          right: 0
          background-repeat: no-repeat
          background-image: url(images/identity/email-icon-dark.svg)
          background-size: 3.5rem
          background-position: center
      input
        border-radius: 5px
        border: solid 1px #c2cbd3
        background-color: #f1f6f9
        text-align: center
      .help
        text-align: center
        font-family: Lato
        font-size: 14px
        color: var(--bluey-grey)
        a
          margin-left: 5px
          color: #007bff
          cursor: pointer
          &:hover
            color: #0056b3
      .avatar-wrap
        .invalid-feedback
          text-align: center
    .info
      text-align: center
      border-radius: 5px
      border: solid 1px var(--bluey-grey)
      background-color: rgba(152, 167, 180, 0.1)
      font-family: Lato
      font-size: 14px
      color: black
      padding: 10px
      margin-top: 1rem
      .title
        display: block
        font-weight: bold
        margin-bottom: 3px
        & ~ a
          margin-left: 5px
      &.yellow
        border: solid 1px var(--golden-rod)
        background-color: rgba(244, 193, 16, 0.1)
      &.white
        border: solid 1px #c2cbd3
        background-color: white
        display: flex
        text-align: left
        .image
          flex: auto 0 0
          img
            margin-right: 1rem
        .content
          flex: auto 1 1
    .actions
      .btn
        width: 100%
        border-radius: 50px
        padding: 0.5rem 1rem
    .avatar
      border-radius: 50%
      width: 150px
      padding-top: 150px
      margin: 0 auto
    &.desktop
      padding: 20px
      .boxed-container
        border: 0
        > h3
          &::before
            background-image: url(images/identity/email-icon-light.svg)
      .actions
        .btn
          width: auto

      .avatar
        border-radius: 50%
    &.personal-data-modal, &.sign-tx-modal
      padding: 0
      text-align: center
      .header-image, img
        width: 100%
      > .padded-content
        padding: 20px
        h2
          font-family: Poppins
          font-weight: 300
          color: var(--dark)
          letter-spacing: -0.3px
          line-height: 1.43
          margin-bottom: 1.5rem
        p
          font-family: Lato
          font-size: 1rem
          line-height: 1.43
          color: var(--dark)
          margin-bottom: 2.25rem
  .pl-modal .pl-modal-table .pl-modal-cell
    .pl-modal-content.user-activation
      &.sign-tx-modal, &.personal-data-modal
        padding: 0
        max-width: 350px
        > .padded-content
          h2, p
            color: #fff
`)