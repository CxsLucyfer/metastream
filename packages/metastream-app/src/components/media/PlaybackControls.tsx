import React, { Component } from 'react'
import cx from 'classnames'

import styles from './PlaybackControls.css'

import { PlaybackState, IMediaPlayerState, RepeatMode } from 'lobby/reducers/mediaPlayer'
import { connect } from 'react-redux'
import {
  server_requestPlayPause,
  server_requestNextMedia,
  server_requestSeek,
  server_requestRepeatMedia
} from 'lobby/actions/mediaPlayer'
import { hasPlaybackPermissions } from 'lobby/reducers/mediaPlayer.helpers'
import { parseCuePoints, copyMediaLink, openMediaInBrowser } from 'media/utils'
import { setVolume, setMute } from 'actions/settings'
import { IAppState } from 'reducers'

// Must include Slider first for CSS precedence order
import { Slider } from 'components/media/Slider'
Slider.name // don't strip unused import

import { VolumeSlider } from 'components/media/VolumeSlider'
import { Timeline } from 'components/media/Timeline'

import { MoreButton } from 'components/media/MoreButton'
import { IconButton } from 'components/common/button'
import { t } from 'locale'
import { IReactReduxProps } from 'types/redux-thunk'
import { setPopupPlayer } from 'actions/ui'
import { PopupWindow } from 'components/Popup'

const Button: React.SFC<{
  id?: string
  className?: string
  icon: string
  title?: string

  /** Highlight button as turned on */
  enabled?: boolean

  /** Disable button interaction */
  disabled?: boolean

  onClick?: React.MouseEventHandler<HTMLButtonElement>
}> = props => {
  return (
    <IconButton
      id={props.id}
      icon={props.icon}
      disabled={props.disabled}
      className={cx(props.className, styles.button, {
        [styles.buttonEnabled]: props.enabled
      })}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </IconButton>
  )
}

const ButtonListItem: React.SFC<{
  icon: string
  title?: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
}> = props => {
  return (
    <IconButton
      icon={props.icon}
      className={styles.buttonListItem}
      title={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </IconButton>
  )
}

interface IProps {
  className?: string
  reload?: React.MouseEventHandler<HTMLButtonElement>
  showInfo: Function
  showInteract: Function
  toggleChat: Function
  openSettings: Function
}

interface IConnectedProps extends IMediaPlayerState {
  mute: boolean
  volume: number

  /** Has permission to change playback state */
  dj: boolean
}

const mapStateToProps = (state: IAppState): IConnectedProps => {
  return {
    ...state.mediaPlayer,
    mute: state.settings.mute,
    volume: state.settings.volume,
    dj: hasPlaybackPermissions(state)
  }
}

type PrivateProps = IProps & IConnectedProps & IReactReduxProps

class _PlaybackControls extends Component<PrivateProps> {
  private getCuePoints() {
    const { current: media } = this.props
    if (media) {
      let cuePoints = parseCuePoints(media)
      return cuePoints
    }
  }

  render(): JSX.Element | null {
    const { current: media, playback, startTime, pauseTime, dj, repeatMode } = this.props
    const playbackIcon = playback === PlaybackState.Playing ? 'pause' : 'play'

    const isIdle = playback === PlaybackState.Idle
    const isPaused = playback === PlaybackState.Paused
    const duration = (media && media.duration) || 0
    const isTimed = duration > 0

    const permTitle = t('requiresDJPermissions')

    const playPauseBtn = (
      <Button
        key="playpause"
        icon={playbackIcon}
        title={dj ? undefined : permTitle}
        disabled={isIdle}
        onClick={this.playPause}
      />
    )

    const nextBtn = (
      <Button
        key="next"
        icon="skip-forward"
        title={dj ? t('next') : permTitle}
        disabled={isIdle}
        onClick={this.next}
      />
    )

    const repeatBtn = (
      <Button
        icon={repeatMode === RepeatMode.One ? 'repeat-one' : 'repeat'}
        title={dj ? t('repeat') : permTitle}
        enabled={repeatMode !== RepeatMode.Off}
        onClick={this.repeat}
      />
    )

    const timeline =
      isIdle || !isTimed ? (
        <span className={styles.spacer} />
      ) : (
        <Timeline
          className={styles.spacer}
          time={(isPaused ? pauseTime : startTime! + this.props.serverClockSkew) || 0}
          paused={isPaused}
          duration={media && media.duration}
          onSeek={this.seek}
          cuePoints={this.getCuePoints()}
        />
      )

    const volumeSlider = (
      <VolumeSlider
        mute={this.props.mute}
        volume={this.props.volume}
        onChange={this.setVolume}
        onMute={this.toggleMute}
      />
    )

    const infoBtn = media && media.description && (
      <Button icon="info" title={t('info')} onClick={() => this.props.showInfo()} />
    )

    const settingsBtn = (
      <Button
        id="settings_btn"
        icon="settings"
        title={t('settings')}
        onClick={() => this.props.openSettings()}
      />
    )

    return (
      <div className={cx(this.props.className, styles.container)}>
        {playPauseBtn}
        {nextBtn}
        {repeatBtn}
        {timeline}
        {volumeSlider}
        {infoBtn}
        {settingsBtn}
        {this.renderMenu()}
      </div>
    )
  }

  private renderMenu() {
    const { current: media } = this.props

    const mediaButtons = media && (
      <>
        <hr className={styles.menuDivider} />

        {FEATURE_POPUP_PLAYER ? (
          <ButtonListItem
            icon="external-link"
            onClick={() => {
              PopupWindow.focus()
              this.props.dispatch(setPopupPlayer(true))
            }}
          >
            {t('openInPopup')}
          </ButtonListItem>
        ) : null}
        <ButtonListItem icon="external-link" onClick={this.openLink}>
          {t('openInBrowser')}
        </ButtonListItem>
        <ButtonListItem icon="clipboard" onClick={this.copyLink}>
          {t('copyLink')}
        </ButtonListItem>
        <ButtonListItem icon="rotate-cw" onClick={this.props.reload}>
          {t('reload')}
        </ButtonListItem>
      </>
    )

    return (
      <MoreButton buttonClassName={styles.button}>
        <ButtonListItem icon="message-circle" onClick={() => this.props.toggleChat()}>
          {t('chat')}
        </ButtonListItem>
        <ButtonListItem icon="mouse-pointer" onClick={() => this.props.showInteract()}>
          {t('interact')}
        </ButtonListItem>
        {mediaButtons}
      </MoreButton>
    )
  }

  private playPause = () => {
    this.props.dispatch!(server_requestPlayPause())
  }

  private next = () => {
    this.props.dispatch!(server_requestNextMedia())
  }

  private repeat = () => {
    this.props.dispatch!(server_requestRepeatMedia())
  }

  private seek = (time: number) => {
    this.props.dispatch!(server_requestSeek(time))
  }

  private setVolume = (volume: number) => {
    this.props.dispatch!(setVolume(volume))
  }

  private toggleMute = () => {
    const mute = !this.props.mute
    this.props.dispatch!(setMute(mute))
  }

  private openLink = () => {
    const { current: media } = this.props
    if (media) {
      openMediaInBrowser(media)
    }
  }

  private copyLink = () => {
    const { current: media } = this.props
    if (media) {
      copyMediaLink(media)
    }
  }
}

export const PlaybackControls = connect(mapStateToProps)(_PlaybackControls)
